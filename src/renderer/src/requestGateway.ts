import { runRequest } from '../../runner/run'
import type { ReqoraApi } from '../../shared/api'
import type { Workspace } from '../../workspace/types'
import { desktopApi } from './platform'

export type RequestGateway = ReqoraApi['request'] & Partial<ReqoraApi['secrets']>

/**
 * Browser-development fallback: sends with the page's fetch (CORS applies)
 * and cannot read secrets, which therefore stay unresolved. Electron always
 * sends from the main process.
 */
export function createBrowserRequestGateway(getWorkspace: () => Workspace | null): RequestGateway {
  return {
    async send(input) {
      const workspace = getWorkspace()
      if (!workspace) return { ok: false, error: 'The workspace is still loading.', unresolved: [] }
      return runRequest(input, {
        workspace,
        readSecret: async () => undefined,
        async send(request) {
          const started = performance.now()
          const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body?.kind === 'text' ? request.body.text : undefined
          })
          const body = await response.text()
          return {
            status: response.status, statusText: response.statusText, headers: [...response.headers.entries()], body,
            truncated: false, sizeBytes: body.length, timeMs: Math.round(performance.now() - started), url: response.url
          }
        }
      })
    }
  }
}

export function defaultRequestGateway(getWorkspace: () => Workspace | null): RequestGateway {
  const api = desktopApi()
  return api?.request ? { ...api.request, reveal: api.secrets?.reveal } : createBrowserRequestGateway(getWorkspace)
}
