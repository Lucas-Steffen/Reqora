import type { PreparedRequest } from '../../runner/prepare'

import type { HttpResponseView } from '../../runner/run'

export type HttpResponseData = HttpResponseView

export interface SendOptions {
  timeoutMs: number
  maxResponseBytes: number
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export const SEND_LIMITS = { timeoutMs: 30_000, maxResponseBytes: 10 * 1024 * 1024 }

export type SendErrorCode = 'INVALID_URL' | 'TIMEOUT' | 'DNS' | 'REFUSED' | 'RESET' | 'TLS' | 'NETWORK' | 'CANCELED'

export class SendError extends Error {
  constructor(readonly code: SendErrorCode, message: string) {
    super(message)
    this.name = 'SendError'
  }
}

/** Finds the system error code undici wraps in `cause` (possibly nested or aggregated). */
function systemCode(error: unknown): string | undefined {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const value = current as { code?: unknown; cause?: unknown; errors?: unknown[] }
    if (typeof value.code === 'string' && value.code !== 'ERR_INVALID_ARG_TYPE') return value.code
    current = value.cause ?? value.errors?.[0]
  }
  return undefined
}

const TLS_CODES = /^(CERT_|ERR_TLS_|ERR_SSL_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_(VERIFY|GET)_|ERR_OSSL)/

/** Turns a transport failure into a classified, user-facing error naming the host. */
export function classifySendError(error: unknown, url: URL): SendError {
  const code = systemCode(error)
  const host = url.host
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NONAME') {
    return new SendError('DNS', `DNS lookup failed: "${url.hostname}" could not be resolved (${code}). Check the host name and your network.`)
  }
  if (code === 'ECONNREFUSED') return new SendError('REFUSED', `Connection refused by ${host}: nothing is listening there. Is the server running and is the port right?`)
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' || code === 'EPIPE') return new SendError('RESET', `The connection to ${host} was closed unexpectedly (${code}).`)
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return new SendError('TIMEOUT', `Connecting to ${host} timed out (${code}).`)
  if (code && TLS_CODES.test(code)) return new SendError('TLS', `TLS/certificate error for ${host} (${code}). The server's certificate is not trusted for this host.`)
  return new SendError('NETWORK', `Could not reach ${host}${code ? ` (${code})` : ''}.`)
}

/** Sends a prepared request from the main process with a deadline and response cap. */
export async function sendHttp(request: PreparedRequest, options: SendOptions): Promise<HttpResponseData> {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    throw new SendError('INVALID_URL', `"${request.url}" is not a complete URL. Select an environment with a base URL or enter an absolute URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SendError('INVALID_URL', `Only http:// and https:// requests can be sent (got ${url.protocol}).`)

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs)
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const started = performance.now()
  try {
    let body: BodyInit | undefined
    if (request.body?.kind === 'text') body = request.body.text
    else if (request.body?.kind === 'form-data') {
      const form = new FormData()
      for (const [key, value] of request.body.fields) form.append(key, value)
      body = form
    }
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: request.method,
      headers: request.headers,
      body,
      redirect: 'follow',
      signal: controller.signal
    })
    const chunks: Uint8Array[] = []
    let size = 0
    let truncated = false
    if (response.body) {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > options.maxResponseBytes) {
          truncated = true
          const room = options.maxResponseBytes - (size - value.byteLength)
          if (room > 0) chunks.push(value.subarray(0, room))
          await reader.cancel().catch(() => undefined)
          break
        }
        chunks.push(value)
      }
    }
    const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body: new TextDecoder().decode(bytes),
      truncated,
      sizeBytes: size,
      timeMs: Math.round(performance.now() - started),
      url: response.url || url.toString()
    }
  } catch (error) {
    if (timedOut) throw new SendError('TIMEOUT', `No response within ${options.timeoutMs / 1000} seconds.`)
    if (options.signal?.aborted) throw new SendError('CANCELED', 'The request was canceled.')
    throw classifySendError(error, url)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}
