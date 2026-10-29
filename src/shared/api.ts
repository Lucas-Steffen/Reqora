/**
 * The complete renderer ⇄ main contract. The preload exposes exactly this
 * object as `window.reqora`; every method maps to one named IPC channel whose
 * handler validates the sender and its arguments.
 */
import type { ImportFailure } from '../importer/errors'
import type { ImportedSpec, ImportOrigin } from '../importer/pipeline'
import type { Workspace } from '../workspace/types'
import type { RunInput, RunResult } from '../runner/run'

export type ImportOutcome =
  | { ok: true; spec: ImportedSpec; origin: ImportOrigin }
  | { ok: false; error: ImportFailure }

export type SaveOutcome =
  | { ok: true; workspace: Workspace }
  | { ok: false; code: 'STALE' | 'INVALID' | 'IO'; message: string }

/** Persisted UI preferences; `initialized` is false until the first save. */
export interface PreferencesSnapshot {
  initialized: boolean
  values: Record<string, unknown>
}

export interface ReqoraApi {
  workspace: {
    load(): Promise<Workspace>
    save(workspace: Workspace): Promise<SaveOutcome>
  }
  importer: {
    /** Native file picker; resolves null when the user cancels. */
    pickFile(): Promise<ImportOutcome | null>
    /** A file dropped onto the window. The preload resolves its path; contents are read in main. */
    fromDroppedFile(file: File): Promise<ImportOutcome>
    fromUrl(url: string): Promise<ImportOutcome>
    /** Aborts the import in progress, if any. */
    cancel?(): Promise<void>
  }
  request: {
    /** Resolves variables (including decrypted secrets) and sends from the main process. */
    send(input: RunInput): Promise<RunResult>
  }
  secrets: {
    /** Decrypts one stored secret for display after an explicit user action. */
    reveal(variableId: string): Promise<string | null>
  }
  /** Search options, scope and per-project history, stored next to the workspace. */
  preferences?: {
    load(): Promise<PreferencesSnapshot>
    save(values: Record<string, unknown>): Promise<boolean>
  }
}

export const IPC = {
  workspaceLoad: 'reqora:workspace:load',
  workspaceSave: 'reqora:workspace:save',
  importPick: 'reqora:import:pick-file',
  importPath: 'reqora:import:dropped-file',
  importUrl: 'reqora:import:url',
  importCancel: 'reqora:import:cancel',
  requestSend: 'reqora:request:send',
  secretReveal: 'reqora:secret:reveal',
  preferencesLoad: 'reqora:preferences:load',
  preferencesSave: 'reqora:preferences:save'
} as const

/**
 * Tauri command names, one per IPC channel above. Rust registers the same
 * names; `contract/ipc-commands.json` pins both sides (see TASK-008).
 */
export const COMMANDS = {
  workspaceLoad: 'workspace_load',
  workspaceSave: 'workspace_save',
  importPick: 'import_pick',
  importPath: 'import_path',
  importUrl: 'import_url',
  importCancel: 'import_cancel',
  requestSend: 'request_send',
  secretReveal: 'secret_reveal',
  preferencesLoad: 'preferences_load',
  preferencesSave: 'preferences_save'
} as const satisfies Record<keyof typeof IPC, string>

/** Error codes a Tauri command may reject with, as `{ code, message }`. */
export const BACKEND_ERROR_CODES = ['STALE', 'INVALID', 'IO'] as const
export type BackendErrorCode = (typeof BACKEND_ERROR_CODES)[number]

declare global {
  interface Window {
    reqora?: ReqoraApi
  }
}
