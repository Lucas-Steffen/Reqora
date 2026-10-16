import { createDemoWorkspace } from './demo'
import type { Workspace } from './types'

/**
 * Replaceable persistence seam. The renderer uses an IPC implementation in
 * Electron and the memory implementation in tests and browser development.
 * `save` is optimistic: it fails when `baseRevision` is stale.
 */
export interface WorkspaceRepository {
  load(): Promise<Workspace>
  save(workspace: Workspace): Promise<Workspace>
}

export class StaleRevisionError extends Error {
  constructor() {
    super('The workspace changed since it was loaded. Reload and try again.')
    this.name = 'StaleRevisionError'
  }
}

export function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') return false
  const workspace = value as Partial<Workspace>
  return workspace.version === 1 && typeof workspace.revision === 'number' && typeof workspace.activeProjectId === 'string' &&
    Array.isArray(workspace.projects) && workspace.projects.length > 0 &&
    workspace.projects.every(project => !!project && typeof project.id === 'string' && typeof project.name === 'string' &&
      Array.isArray(project.folders) && Array.isArray(project.endpoints) && Array.isArray(project.resources) && Array.isArray(project.importSources))
}

/** Applies the revision rule shared by every store. */
export function nextRevision(current: Workspace, incoming: Workspace): Workspace {
  if (incoming.revision !== current.revision) throw new StaleRevisionError()
  return { ...structuredClone(incoming), revision: current.revision + 1 }
}

export function createMemoryWorkspaceRepository(initial: Workspace = createDemoWorkspace()): WorkspaceRepository {
  let current = structuredClone(initial)
  return {
    async load() { return structuredClone(current) },
    async save(workspace) {
      current = nextRevision(current, workspace)
      return structuredClone(current)
    }
  }
}
