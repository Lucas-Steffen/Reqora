import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { BACKEND_ERROR_CODES, COMMANDS, type BackendErrorCode, type ImportOutcome, type PreferencesSnapshot, type ReqoraApi, type SaveOutcome } from '../../../shared/api'
import { runRequest, type HttpResponseView, type RunInput, type RunResult } from '../../../runner/run'
import type { PreparedRequest } from '../../../runner/prepare'
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
  request: true,
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

/** What `request_send` resolves with: the masked response and the secrets that did not open. */
interface SendOutcome {
  response: Omit<HttpResponseView, 'timeMs'>
  unresolved: string[]
}

/** 128 random bits in hex: placeholders of one send cannot be guessed or collide with text. */
function placeholderNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Runs the request in the WebView with placeholders where secrets go
 * (ADR-010). Rust checks each placeholder against the stored workspace of the
 * project, puts the real value in, sends, and masks the value out of the
 * response; the WebView never holds a secret value.
 */
async function sendWithPlaceholders(call: <T>(command: string, args?: Record<string, unknown>) => Promise<T>, workspace: Workspace, input: RunInput): Promise<RunResult> {
  const nonce = placeholderNonce()
  const secretRefs: Record<string, string> = {}
  const projectId = input.projectId ?? workspace.activeProjectId
  let backendUnresolved: string[] = []
  const result = await runRequest(input, {
    workspace,
    async readSecret(variable) {
      if (!variable.hasStoredSecret) return undefined
      const placeholder = `rqs_${nonce}_${Object.keys(secretRefs).length}`
      secretRefs[placeholder] = variable.id
      return placeholder
    },
    async send(prepared: PreparedRequest) {
      const started = performance.now()
      const { method, url, headers, body } = prepared
      // Only the secrets the request uses: one that is never sent is not reported unresolved, as in Electron.
      const used = new Set(JSON.stringify([url, headers, body]).match(new RegExp(`rqs_${nonce}_\\d+`, 'g')))
      const usedRefs = Object.fromEntries(Object.entries(secretRefs).filter(([placeholder]) => used.has(placeholder)))
      const outcome = await call<SendOutcome>(COMMANDS.requestSend, { input: { projectId, prepared: { method, url, headers, body }, secretRefs: usedRefs } })
      backendUnresolved = outcome.unresolved
      return { ...outcome.response, timeMs: Math.round(performance.now() - started) }
    }
  })
  const unresolved = [...result.unresolved, ...backendUnresolved.filter(key => !result.unresolved.includes(key))]
  return { ...result, unresolved }
}

/**
 * The `ReqoraApi` contract over Tauri commands; areas the backend lacks are left out.
 * Sending needs the renderer's workspace, so the request area exists only with `getWorkspace`.
 */
export function createTauriApi(invoke: Invoke = (command, args) => tauriInvoke(command, args), backend: TauriBackend = TAURI_BACKEND, getWorkspace?: () => Workspace | null): Partial<ReqoraApi> {
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
  if (backend.request && getWorkspace) {
    api.request = {
      async send(input) {
        const workspace = getWorkspace()
        if (!workspace) return { ok: false, error: 'The workspace is still loading.', unresolved: [] }
        return sendWithPlaceholders(call, workspace, input)
      },
      cancel: () => call<void>(COMMANDS.requestCancel)
    }
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
