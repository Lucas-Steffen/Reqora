import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ImportError, redactUrl, toImportFailure } from '../importer/errors'
import { importDocument } from '../importer/pipeline'
import type { ImportOutcome } from '../shared/api'
import type { ReferenceLoader } from '../importer/refs'
import { DOCUMENT_FETCH_LIMITS, fetchText, parseHttpUrl, type BoundedFetchOptions } from './http/boundedFetch'

export const DOCUMENT_EXTENSIONS = ['.json', '.yaml', '.yml']

export interface ImportServiceOptions {
  fetchOptions?: Partial<BoundedFetchOptions>
}

async function readLocalFile(path: string, maxBytes: number): Promise<string> {
  let info
  try {
    info = await stat(path)
  } catch {
    throw new ImportError('FILE', `The file ${basename(path)} could not be found or opened.`)
  }
  if (!info.isFile()) throw new ImportError('FILE', `${basename(path)} is not a file.`)
  if (info.size > maxBytes) throw new ImportError('TOO_LARGE', `${basename(path)} is larger than the ${maxBytes / 1024 / 1024} MB import limit.`)
  try {
    return await readFile(path, 'utf8')
  } catch {
    throw new ImportError('FILE', `The file ${basename(path)} could not be read.`)
  }
}

export function createImportService(options: ImportServiceOptions = {}) {
  const fetchOptions: BoundedFetchOptions = { ...DOCUMENT_FETCH_LIMITS, ...options.fetchOptions }

  const httpLoader: ReferenceLoader = async uri => (await fetchText(uri, fetchOptions)).text

  /** Local references must stay inside the selected document's directory (after resolving symlinks). */
  function fileLoader(rootDirectory: string): ReferenceLoader {
    return async uri => {
      if (uri.startsWith('http:') || uri.startsWith('https:')) return httpLoader(uri)
      if (!uri.startsWith('file:')) throw new ImportError('UNSUPPORTED_SCHEME', 'only file and http(s) references are supported')
      const path = await realpath(fileURLToPath(uri)).catch(() => {
        throw new ImportError('FILE', 'the referenced file does not exist')
      })
      const inside = relative(rootDirectory, path)
      if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
        throw new ImportError('FILE', 'references outside the imported file\'s folder are not allowed')
      }
      return readLocalFile(path, fetchOptions.maxBytes)
    }
  }

  async function fromPath(path: string): Promise<ImportOutcome> {
    try {
      if (!DOCUMENT_EXTENSIONS.includes(extname(path).toLowerCase())) {
        throw new ImportError('FILE', 'Choose a .json, .yaml or .yml OpenAPI/Swagger file.')
      }
      const resolved = await realpath(path).catch(() => {
        throw new ImportError('FILE', `The file ${basename(path)} could not be found or opened.`)
      })
      const text = await readLocalFile(resolved, fetchOptions.maxBytes)
      const spec = await importDocument(text, pathToFileURL(resolved).toString(), fileLoader(dirname(resolved)))
      return { ok: true, spec, origin: { kind: 'file', location: basename(resolved) } }
    } catch (error) {
      return { ok: false, error: toImportFailure(error) }
    }
  }

  async function fromUrl(input: string): Promise<ImportOutcome> {
    try {
      const url = parseHttpUrl(input)
      const { text, finalUrl } = await fetchText(url.toString(), fetchOptions)
      const loader: ReferenceLoader = async uri => {
        if (!uri.startsWith('http:') && !uri.startsWith('https:')) {
          throw new ImportError('UNSUPPORTED_SCHEME', 'documents loaded from a URL cannot reference local files')
        }
        return httpLoader(uri)
      }
      const spec = await importDocument(text, finalUrl, loader)
      return { ok: true, spec, origin: { kind: 'url', location: redactUrl(url.toString()) } }
    } catch (error) {
      return { ok: false, error: toImportFailure(error) }
    }
  }

  return { fromPath, fromUrl }
}
