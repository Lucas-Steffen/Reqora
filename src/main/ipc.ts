import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC, type ImportOutcome, type SaveOutcome } from '../shared/api'
import { StaleRevisionError, type WorkspaceRepository } from '../workspace/repository'
import type { Workspace } from '../workspace/types'
import type { createImportService } from './importService'

export interface IpcDependencies {
  store: WorkspaceRepository
  importer: ReturnType<typeof createImportService>
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

export function registerIpc({ store, importer, isTrustedUrl }: IpcDependencies): void {
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
  handle(IPC.importUrl, (_event, url) => {
    if (typeof url !== 'string' || url.length > 8192) {
      return { ok: false, error: { code: 'INVALID_URL', message: 'Enter a valid URL.' } } satisfies ImportOutcome
    }
    return importer.fromUrl(url)
  })
}
