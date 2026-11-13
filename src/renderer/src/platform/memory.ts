import { createMemoryWorkspaceRepository, type WorkspaceRepository } from '../../../workspace/repository'
import type { Workspace } from '../../../workspace/types'
import { createBrowserImportGateway, type ImportGateway } from '../importGateway'
import { createBrowserRequestGateway, type RequestGateway } from '../requestGateway'

export interface MemoryPlatform {
  workspace: WorkspaceRepository
  importer: ImportGateway
  request: RequestGateway
}

/**
 * Backend-less adapter: the workspace lives only in memory, imports and
 * requests run in the page. Used by the browser, tests and the Tauri
 * prototype; nothing is persisted.
 */
export function createMemoryPlatform(getWorkspace: () => Workspace | null, initial?: Workspace): MemoryPlatform {
  return {
    workspace: createMemoryWorkspaceRepository(initial),
    importer: createBrowserImportGateway(),
    request: createBrowserRequestGateway(getWorkspace)
  }
}
