import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC, type ImportOutcome, type SaveOutcome } from '../shared/api'
import { StaleRevisionError, type WorkspaceRepository } from '../workspace/repository'
import type { Workspace } from '../workspace/types'
import type { createImportService } from './importService'
import type { RunInput, RunResult } from '../runner/run'
import type { RequestDraft } from '../runner/prepare'

export interface IpcDependencies {
  store: WorkspaceRepository
  importer: ReturnType<typeof createImportService>
  runRequest: (input: RunInput) => Promise<RunResult>
  revealSecret: (variableId: string) => Promise<string | null>
  /** Returns true when the frame URL is this app's own renderer. */
  isTrustedUrl: (url: string) => boolean
}

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

/** Only the app's own top-level renderer may call privileged handlers. */
export function guarded(isTrustedUrl: (url: string) => boolean, handler: Handler): Handler {
  return (event, ...args) => {
    const frame = event.senderFrame
    if (!frame || frame.parent !== null || !isTrustedUrl(frame.url)) throw new Error('Untrusted IPC sender')
    return handler(event, ...args)
  }
}

function isDraft(value: unknown): value is RequestDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<RequestDraft>
  return typeof draft.method === 'string' && typeof draft.url === 'string' && Array.isArray(draft.query) &&
    Array.isArray(draft.headers) && Array.isArray(draft.pathParams) && Array.isArray(draft.cookies) && !!draft.body && typeof draft.body === 'object'
}

export function registerIpc({ store, importer, isTrustedUrl, runRequest, revealSecret }: IpcDependencies): void {
  const handle = (channel: string, handler: Handler) => ipcMain.handle(channel, guarded(isTrustedUrl, handler))

  handle(IPC.workspaceLoad, () => store.load())
  handle(IPC.workspaceSave, async (_event, workspace): Promise<SaveOutcome> => {
    try {
      return { ok: true, workspace: await store.save(workspace as Workspace) }
    } catch (error) {
      if (error instanceof StaleRevisionError) return { ok: false, code: 'STALE', message: error.message }
      const message = error instanceof Error ? error.message : 'The workspace could not be saved.'
      return { ok: false, code: message.includes('invalid') ? 'INVALID' : 'IO', message }
    }
  })

  handle(IPC.importPick, async (event): Promise<ImportOutcome | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Import OpenAPI or Swagger',
      properties: ['openFile'],
      filters: [{ name: 'OpenAPI / Swagger', extensions: ['json', 'yaml', 'yml'] }]
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return importer.fromPath(result.filePaths[0])
  })
  handle(IPC.importPath, (_event, path) => {
    if (typeof path !== 'string' || !path || path.length > 4096) {
      return { ok: false, error: { code: 'FILE', message: 'The dropped item is not a readable file.' } } satisfies ImportOutcome
    }
    return importer.fromPath(path)
  })
  handle(IPC.requestSend, (_event, input): Promise<RunResult> | RunResult => {
    const candidate = input as Partial<RunInput> | undefined
    if (!candidate || typeof candidate.endpointId !== 'string' || (candidate.draft !== undefined && !isDraft(candidate.draft))) {
      return { ok: false, error: 'The request is invalid.', unresolved: [] }
    }
    return runRequest({ endpointId: candidate.endpointId, draft: candidate.draft })
  })
  handle(IPC.secretReveal, (_event, variableId) => typeof variableId === 'string' && variableId.length < 200 ? revealSecret(variableId) : null)
  handle(IPC.importUrl, (_event, url) => {
    if (typeof url !== 'string' || url.length > 8192) {
      return { ok: false, error: { code: 'INVALID_URL', message: 'Enter a valid URL.' } } satisfies ImportOutcome
    }
    return importer.fromUrl(url)
  })
}
