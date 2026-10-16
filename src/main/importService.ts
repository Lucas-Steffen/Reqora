import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, relative, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ImportError, redactUrl, toImportFailure } from '../importer/errors'
import { importDocument } from '../importer/pipeline'
import type { ImportOutcome } from '../shared/api'
import type { ReferenceLoader } from '../importer/refs'
import { DOCUMENT_FETCH_LIMITS, fetchText, parseHttpUrl, type BoundedFetchOptions } from './http/boundedFetch'

export const DOCUMENT_EXTENSIONS = ['.json', '.yaml', '.yml']
/** Whole-import deadline, covering the document and every external reference. */
export const IMPORT_DEADLINE_MS = 30_000

export interface ImportServiceOptions {
  fetchOptions?: Partial<BoundedFetchOptions>
  deadlineMs?: number
}

export interface PathOptions {
  /** UNC (\\host\share) paths are only accepted from the OS file dialog, never from renderer-supplied paths. */
  allowNetworkPath?: boolean
}

const isNetworkPath = (path: string) => /^[\\/]{2}/.test(path)

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

function inside(root: string, path: string): boolean {
  const child = relative(root, path)
  return !!child && !child.startsWith('..') && !isAbsolute(child)
}

export function createImportService(options: ImportServiceOptions = {}) {
  const baseFetch: BoundedFetchOptions = { ...DOCUMENT_FETCH_LIMITS, ...options.fetchOptions }
  const deadlineMs = options.deadlineMs ?? IMPORT_DEADLINE_MS
  let active: AbortController | null = null

  /** One import at a time: a new one cancels the previous. */
  function begin(): { signal: AbortSignal; fetchOptions: BoundedFetchOptions; finish(): void } {
    active?.abort()
    const controller = new AbortController()
    active = controller
    const timer = setTimeout(() => controller.abort(new ImportError('TIMEOUT', `The import did not finish within ${deadlineMs / 1000} seconds.`)), deadlineMs)
    return {
      signal: controller.signal,
      fetchOptions: { ...baseFetch, signal: controller.signal },
      finish() {
        clearTimeout(timer)
        if (active === controller) active = null
      }
    }
  }

  function failure(error: unknown, signal: AbortSignal): ImportOutcome {
    if (signal.aborted && signal.reason instanceof ImportError) return { ok: false, error: signal.reason.toJSON() }
    return { ok: false, error: toImportFailure(error) }
  }

  /**
   * Local references must stay inside the selected document's folder. The
   * check is lexical first (no filesystem access for outside paths, so a
   * UNC or host-bearing file: URL never triggers a network logon), then
   * repeated after resolving symlinks. Remote references are not fetched for
   * local files.
   */
  function fileLoader(rootDirectory: string): ReferenceLoader {
    return async uri => {
      if (uri.startsWith('http:') || uri.startsWith('https:')) {
        throw new ImportError('UNSUPPORTED_SCHEME', 'remote references are not followed for local files')
      }
      if (!uri.startsWith('file:')) throw new ImportError('UNSUPPORTED_SCHEME', 'only file and http(s) references are supported')
      const url = new URL(uri)
      if (url.host) throw new ImportError('FILE', 'network-share references are not allowed')
      const lexical = resolvePath(fileURLToPath(url))
      if (isNetworkPath(lexical) || !inside(rootDirectory, lexical)) {
        throw new ImportError('FILE', 'references outside the imported file\'s folder are not allowed')
      }
      const real = await realpath(lexical).catch(() => {
        throw new ImportError('FILE', 'the referenced file does not exist')
      })
      if (!inside(rootDirectory, real)) throw new ImportError('FILE', 'references outside the imported file\'s folder are not allowed')
      return readLocalFile(real, baseFetch.maxBytes)
    }
  }

  async function fromPath(path: string, pathOptions: PathOptions = {}): Promise<ImportOutcome> {
    const run = begin()
    try {
      if (!pathOptions.allowNetworkPath && isNetworkPath(path)) {
        throw new ImportError('FILE', 'Files on network shares can only be imported with "Choose file…".')
      }
      if (!DOCUMENT_EXTENSIONS.includes(extname(path).toLowerCase())) {
        throw new ImportError('FILE', 'Choose a .json, .yaml or .yml OpenAPI/Swagger file.')
      }
      const resolved = await realpath(path).catch(() => {
        throw new ImportError('FILE', `The file ${basename(path)} could not be found or opened.`)
      })
      const text = await readLocalFile(resolved, baseFetch.maxBytes)
      const spec = await importDocument(text, pathToFileURL(resolved).toString(), fileLoader(dirname(resolved)))
      run.signal.throwIfAborted()
      return { ok: true, spec, origin: { kind: 'file', location: basename(resolved), identity: resolved } }
    } catch (error) {
      return failure(error, run.signal)
    } finally {
      run.finish()
    }
  }

  async function fromUrl(input: string): Promise<ImportOutcome> {
    const run = begin()
    try {
      const url = parseHttpUrl(input)
      const { text, finalUrl } = await fetchText(url.toString(), run.fetchOptions)
      const origin = new URL(finalUrl).origin
      // Same-origin only: a document cannot make Reqora probe other hosts (intranet, metadata services).
      const loader: ReferenceLoader = async uri => {
        if (!uri.startsWith('http:') && !uri.startsWith('https:')) {
          throw new ImportError('UNSUPPORTED_SCHEME', 'documents loaded from a URL cannot reference local files')
        }
        if (new URL(uri).origin !== origin) throw new ImportError('UNSUPPORTED_SCHEME', 'only references on the same origin as the document are followed')
        return (await fetchText(uri, run.fetchOptions)).text
      }
      const spec = await importDocument(text, finalUrl, loader)
      run.signal.throwIfAborted()
      const identity = new URL(url)
      identity.username = ''
      identity.password = ''
      identity.hash = ''
      return { ok: true, spec, origin: { kind: 'url', location: redactUrl(url.toString()), identity: identity.toString() } }
    } catch (error) {
      return failure(error, run.signal)
    } finally {
      run.finish()
    }
  }

  function cancel(): void {
    active?.abort(new ImportError('CANCELED', 'The import was canceled.'))
  }

  return { fromPath, fromUrl, cancel }
}
