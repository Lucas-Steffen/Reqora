import { ImportError, redactUrl, toImportFailure } from '../../importer/errors'
import { importDocument } from '../../importer/pipeline'
import type { ImportOutcome, ReqoraApi } from '../../shared/api'

export type ImportGateway = ReqoraApi['importer']

const MAX_BYTES = 5 * 1024 * 1024

function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new ImportError('FILE', 'The file could not be read.'))
    reader.readAsText(file)
  })
}

/**
 * Fallback used outside Electron (browser development, component tests).
 * Files are read in the page and external references are not followed; URL
 * fetches are subject to CORS. The Electron build always uses the main process.
 */
export function createBrowserImportGateway(fetchImpl: typeof fetch = (...args) => fetch(...args)): ImportGateway {
  const noExternal = async () => { throw new ImportError('FILE', 'external references are only followed in the desktop app') }
  async function fromFile(file: File): Promise<ImportOutcome> {
    try {
      if (file.size > MAX_BYTES) throw new ImportError('TOO_LARGE', `${file.name} is larger than the 5 MB import limit.`)
      const spec = await importDocument(await readText(file), `file:///${encodeURIComponent(file.name)}`, noExternal)
      return { ok: true, spec, origin: { kind: 'file', location: file.name } }
    } catch (error) {
      return { ok: false, error: toImportFailure(error) }
    }
  }
  return {
    pickFile: () => new Promise(resolve => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,.yaml,.yml'
      input.onchange = () => input.files?.[0] ? resolve(fromFile(input.files[0])) : resolve(null)
      input.click()
    }),
    fromDroppedFile: fromFile,
    async fromUrl(url) {
      try {
        let parsed: URL
        try { parsed = new URL(url) } catch { throw new ImportError('INVALID_URL', 'Enter a complete URL, for example https://example.com/openapi.json.') }
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new ImportError('UNSUPPORTED_SCHEME', `Only http:// and https:// URLs can be imported (got ${parsed.protocol}).`)
        const response = await fetchImpl(parsed).catch(() => { throw new ImportError('NETWORK', `Could not reach ${parsed.host}.`) })
        if (!response.ok) throw new ImportError('HTTP_STATUS', `The server responded with HTTP ${response.status} for ${redactUrl(url)}.`)
        const spec = await importDocument(await response.text(), parsed.toString(), noExternal)
        return { ok: true, spec, origin: { kind: 'url', location: redactUrl(url) } }
      } catch (error) {
        return { ok: false, error: toImportFailure(error) }
      }
    }
  }
}

export function defaultImportGateway(): ImportGateway {
  return typeof window !== 'undefined' && window.reqora ? window.reqora.importer : createBrowserImportGateway()
}
