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
  }
  request: {
    /** Resolves variables (including decrypted secrets) and sends from the main process. */
    send(input: RunInput): Promise<RunResult>
  }
  secrets: {
    /** Decrypts one stored secret for display after an explicit user action. */
    reveal(variableId: string): Promise<string | null>
  }
}

export const IPC = {
  workspaceLoad: 'reqora:workspace:load',
  workspaceSave: 'reqora:workspace:save',
  importPick: 'reqora:import:pick-file',
  importPath: 'reqora:import:dropped-file',
  importUrl: 'reqora:import:url',
  requestSend: 'reqora:request:send',
  secretReveal: 'reqora:secret:reveal'
} as const

declare global {
  interface Window {
    reqora?: ReqoraApi
  }
}
