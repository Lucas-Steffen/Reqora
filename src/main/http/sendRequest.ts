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

export class SendError extends Error {
  constructor(readonly code: 'INVALID_URL' | 'TIMEOUT' | 'NETWORK' | 'CANCELED', message: string) {
    super(message)
    this.name = 'SendError'
  }
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
    const cause = (error as { cause?: { code?: string } })?.cause?.code
    throw new SendError('NETWORK', `Could not reach ${url.host}${cause ? ` (${cause})` : ''}.`)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}
