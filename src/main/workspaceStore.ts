import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createDemoWorkspace } from '../workspace/demo'
import { isWorkspace, nextRevision, normalizeWorkspace, type WorkspaceRepository } from '../workspace/repository'
import type { Workspace } from '../workspace/types'

export const MAX_WORKSPACE_BYTES = 64 * 1024 * 1024

/** Hooks that let features transform data at the disk boundary (e.g. moving secrets out). */
export interface StoreHooks {
  /** Applied to every workspace before it is written; its result is what callers get back. */
  beforePersist?: (workspace: Workspace) => Promise<Workspace>
  /** Applied once to the workspace read from disk. */
  afterLoad?: (workspace: Workspace) => Promise<Workspace>
}

/**
 * JSON file store in the user-data directory. Writes go to a temporary file
 * that is renamed over the original, so a crash never leaves a partial file.
 * Saves are serialized to keep revisions monotonic.
 */
export function createFileWorkspaceStore(directory: string, hooks: StoreHooks = {}): WorkspaceRepository {
  const file = join(directory, 'workspace.json')
  let current: Workspace | undefined
  let queue: Promise<unknown> = Promise.resolve()

  async function readCurrent(): Promise<Workspace> {
    if (current) return current
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch {
      current = createDemoWorkspace()
      return current
    }
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = undefined }
    if (isWorkspace(parsed)) {
      current = normalizeWorkspace(parsed)
      if (hooks.afterLoad) current = await hooks.afterLoad(current)
    } else {
      // Keep the unreadable file for recovery instead of overwriting it on the next save.
      await rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined)
      current = createDemoWorkspace()
    }
    return current
  }

  async function persist(workspace: Workspace): Promise<void> {
    const text = JSON.stringify(workspace, null, 2)
    if (Buffer.byteLength(text) > MAX_WORKSPACE_BYTES) throw new Error('The workspace is too large to save.')
    await mkdir(directory, { recursive: true })
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, file)
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }

  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  return {
    load: () => serialized(async () => structuredClone(await readCurrent())),
    save: incoming => serialized(async () => {
      if (!isWorkspace(incoming)) throw new Error('The workspace data is invalid and was not saved.')
      let next = nextRevision(await readCurrent(), normalizeWorkspace(incoming))
      if (hooks.beforePersist) next = await hooks.beforePersist(next)
      await persist(next)
      current = next
      return structuredClone(next)
    })
  }
}
