import type { ReqoraApi } from '../../../shared/api'
import { createTauriApi } from './tauri'

export type PlatformKind = 'electron' | 'tauri' | 'browser'

type HostWindow = Pick<Window, 'reqora'> & { __TAURI_INTERNALS__?: unknown }

function hostWindow(): HostWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as HostWindow)
}

/** Which host the renderer runs in, checked Tauri → Electron → browser. */
export function detectPlatform(host: HostWindow | undefined = hostWindow()): PlatformKind {
  if (host && '__TAURI_INTERNALS__' in host) return 'tauri'
  if (host?.reqora) return 'electron'
  return 'browser'
}

let tauriApi: Partial<ReqoraApi> | undefined

/**
 * The desktop backend, if any. Under Tauri only the areas the Rust backend
 * implements are present (see `TAURI_BACKEND`); callers fall back per area.
 */
export function desktopApi(host: HostWindow | undefined = hostWindow()): Partial<ReqoraApi> | undefined {
  switch (detectPlatform(host)) {
    case 'tauri': return tauriApi ??= createTauriApi()
    case 'electron': return host!.reqora
    default: return undefined
  }
}
