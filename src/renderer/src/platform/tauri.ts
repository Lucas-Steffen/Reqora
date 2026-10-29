import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { BACKEND_ERROR_CODES, COMMANDS, type BackendErrorCode, type ImportOutcome, type PreferencesSnapshot, type ReqoraApi, type SaveOutcome } from '../../../shared/api'
import type { RunResult } from '../../../runner/run'
import { createDemoWorkspace } from '../../../workspace/demo'
import { isWorkspace, normalizeWorkspace } from '../../../workspace/repository'
import type { Workspace } from '../../../workspace/types'

/** The subset of `@tauri-apps/api/core` invoke the adapter needs; tests pass a fake. */
export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

/**
 * Which areas of the contract the Rust backend implements. An area stays off
 * (and the renderer keeps its in-page fallback) until its commands exist:
 * TASK-009 workspace, TASK-010 secrets, TASK-012 request, TASK-013 importer.
 */
export interface TauriBackend {
  workspace: boolean
  importer: boolean
  request: boolean
  secrets: boolean
  preferences: boolean
}

export const TAURI_BACKEND: TauriBackend = {
  workspace: true,
  importer: false,
  request: false,
  secrets: true,
  preferences: false
}

/** A command rejection, normalized. Rust rejects with `{ code, message }`. */
export class PlatformError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'PlatformError'
  }
}

export function toPlatformError(error: unknown): PlatformError {
  if (error instanceof PlatformError) return error
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' && typeof (error as { message?: unknown }).message === 'string') {
    const { code, message } = error as { code: string; message: string }
    return new PlatformError(code, message)
  }
  // Tauri itself rejects with a plain string (unknown command, bad arguments).
  if (typeof error === 'string') return new PlatformError('UNKNOWN', error)
  return new PlatformError('IPC', error instanceof Error ? error.message : 'The desktop backend did not respond.')
}

function isBackendErrorCode(code: string): code is BackendErrorCode {
  return (BACKEND_ERROR_CODES as readonly string[]).includes(code)
}

/** The `ReqoraApi` contract over Tauri commands; areas the backend lacks are left out. */
export function createTauriApi(invoke: Invoke = (command, args) => tauriInvoke(command, args), backend: TauriBackend = TAURI_BACKEND): Partial<ReqoraApi> {
  const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    try {
      return await invoke<T>(command, args)
    } catch (error) {
      throw toPlatformError(error)
    }
  }
  const api: Partial<ReqoraApi> = {}
  if (backend.workspace) {
    api.workspace = {
      // Rust keeps the file as opaque JSON: `null` is a first run, and the
      // schema (including the v1 -> v2 migration) stays in TypeScript.
      async load() {
        const stored = await call<unknown>(COMMANDS.workspaceLoad)
        if (stored === null) return createDemoWorkspace()
        if (!isWorkspace(stored)) throw new PlatformError('INVALID', 'The saved workspace is not valid.')
        return normalizeWorkspace(stored)
      },
      async save(workspace) {
        try {
          return await call<SaveOutcome>(COMMANDS.workspaceSave, { workspace })
        } catch (error) {
          const failure = toPlatformError(error)
          if (isBackendErrorCode(failure.code)) return { ok: false, code: failure.code, message: failure.message }
          throw failure
        }
      }
    }
  }
  if (backend.importer) {
    api.importer = {
      pickFile: () => call<ImportOutcome | null>(COMMANDS.importPick),
      // Tauri hands over dropped paths through the window's drag-drop event,
      // not through a DOM File; TASK-013 wires that up.
      fromDroppedFile: async () => ({ ok: false, error: { code: 'FILE', message: 'Dropping files is not available yet in this build.' } }),
      fromUrl: url => call<ImportOutcome>(COMMANDS.importUrl, { url }),
      cancel: () => call<void>(COMMANDS.importCancel)
    }
  }
  if (backend.request) {
    api.request = { send: input => call<RunResult>(COMMANDS.requestSend, { input }) }
  }
  if (backend.secrets) {
    api.secrets = { reveal: variableId => call<string | null>(COMMANDS.secretReveal, { variableId }) }
  }
  if (backend.preferences) {
    api.preferences = {
      load: () => call<PreferencesSnapshot>(COMMANDS.preferencesLoad),
      save: values => call<boolean>(COMMANDS.preferencesSave, { values })
    }
  }
  return api
}
