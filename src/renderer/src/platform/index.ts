import type { ReqoraApi } from '../../../shared/api'

export type PlatformKind = 'electron' | 'tauri' | 'browser'

type HostWindow = Pick<Window, 'reqora'> & { __TAURI_INTERNALS__?: unknown }

function hostWindow(): HostWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as HostWindow)
}

/** Which host the renderer runs in. Electron wins if both markers exist. */
export function detectPlatform(host: HostWindow | undefined = hostWindow()): PlatformKind {
  if (host?.reqora) return 'electron'
  if (host && '__TAURI_INTERNALS__' in host) return 'tauri'
  return 'browser'
}

/**
 * The desktop backend, if any. Only Electron has one so far; the Tauri host
 * runs on the in-memory adapter (`./memory`) until its IPC adapter lands.
 */
export function desktopApi(host: HostWindow | undefined = hostWindow()): ReqoraApi | undefined {
  return detectPlatform(host) === 'electron' ? host!.reqora : undefined
}
