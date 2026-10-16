import { ImportError, redactUrl } from '../../importer/errors'

export interface BoundedFetchOptions {
  timeoutMs: number
  maxBytes: number
  maxRedirects: number
  /** Injected for tests; defaults to the platform fetch. */
  fetchImpl?: typeof fetch
  accept?: string
  signal?: AbortSignal
}

export const DOCUMENT_FETCH_LIMITS = { timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024, maxRedirects: 5 }

export function parseHttpUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new ImportError('INVALID_URL', 'Enter a complete URL, for example https://example.com/openapi.json.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ImportError('UNSUPPORTED_SCHEME', `Only http:// and https:// URLs can be imported (got ${url.protocol}).`)
  }
  if (url.username || url.password) {
    throw new ImportError('INVALID_URL', 'URLs with a user name or password (user:pass@host) are not supported. Remove the credentials from the URL.')
  }
  return url
}

/**
 * GET a text document with a total deadline (headers and body), a byte cap
 * enforced while streaming, and manually followed, re-validated redirects.
 * Runs in the main process, so renderer CORS rules do not apply.
 */
export async function fetchText(input: string, options: BoundedFetchOptions): Promise<{ text: string; finalUrl: string; contentType?: string }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs)
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  let url = parseHttpUrl(input)
  try {
    for (let redirects = 0; ; redirects++) {
      let response: Response
      try {
        response = await fetchImpl(url, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { accept: options.accept ?? 'application/json, application/yaml, text/yaml, */*;q=0.5' }
        })
      } catch (error) {
        throw transportError(error, timedOut, options, url)
      }
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        await response.body?.cancel().catch(() => undefined)
        if (redirects >= options.maxRedirects) {
          throw new ImportError('TOO_MANY_REDIRECTS', `Stopped after ${options.maxRedirects} redirects from ${redactUrl(input)}.`)
        }
        const next = new URL(response.headers.get('location')!, url)
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          throw new ImportError('UNSUPPORTED_SCHEME', `The server redirected to an unsupported ${next.protocol} URL.`)
        }
        if (url.protocol === 'https:' && next.protocol === 'http:') {
          throw new ImportError('UNSUPPORTED_SCHEME', 'The server redirected from HTTPS to insecure HTTP; the import was stopped.')
        }
        url = next
        continue
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        throw new ImportError('HTTP_STATUS', `The server responded with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} for ${redactUrl(url.toString())}.`)
      }
      const declared = Number(response.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > options.maxBytes) {
        await response.body?.cancel().catch(() => undefined)
        throw tooLarge(options.maxBytes)
      }
      const text = await readLimited(response, options, () => timedOut, url)
      return { text, finalUrl: url.toString(), contentType: response.headers.get('content-type') ?? undefined }
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

function tooLarge(maxBytes: number): ImportError {
  return new ImportError('TOO_LARGE', `The document is larger than the ${(maxBytes / 1024 / 1024).toLocaleString('en-US')} MB import limit.`)
}

async function readLimited(response: Response, options: BoundedFetchOptions, timedOut: () => boolean, url: URL): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > options.maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw tooLarge(options.maxBytes)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof ImportError) throw error
    throw transportError(error, timedOut(), options, url)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8').decode(bytes)
}

function transportError(error: unknown, timedOut: boolean, options: BoundedFetchOptions, url: URL): ImportError {
  if (timedOut) return new ImportError('TIMEOUT', `The server did not finish responding within ${options.timeoutMs / 1000} seconds.`)
  if (options.signal?.aborted) return new ImportError('CANCELED', 'The import was canceled.')
  const cause = (error as { cause?: { code?: string } })?.cause?.code
  const detail = cause === 'ENOTFOUND' ? 'the host name could not be found'
    : cause === 'ECONNREFUSED' ? 'the connection was refused'
      : cause?.startsWith('CERT') || cause?.includes('TLS') || cause === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ? 'the TLS certificate is not trusted'
        : 'a network error occurred'
  return new ImportError('NETWORK', `Could not reach ${url.host}: ${detail}.`)
}
