import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createDemoWorkspace } from '../workspace/demo'
import { isWorkspace, nextRevision, normalizeWorkspace, WORKSPACE_VERSION, type WorkspaceRepository } from '../workspace/repository'
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
  let pendingBackup: { version: number; text: string } | undefined

  async function readCurrent(): Promise<Workspace> {
    if (current) return current
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      // Only a missing file means "first run". Any other error (locks, permissions) must not
      // lead to the demo being saved over the user's data, so loading fails instead.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('The workspace file could not be read. Close other programs using it and restart Reqora.')
      current = createDemoWorkspace()
      return current
    }
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = undefined }
    if (isWorkspace(parsed)) {
      // An older format is migrated in memory; the original bytes are kept for a one-time backup.
      if ((parsed as { version: number }).version !== WORKSPACE_VERSION) pendingBackup = { version: (parsed as { version: number }).version, text }
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
      if (pendingBackup) {
        // Never overwrite an existing backup ('wx'); failure to back up blocks the save.
        await writeFile(join(directory, `workspace.v${pendingBackup.version}.backup.json`), pendingBackup.text, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
          .catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error })
        pendingBackup = undefined
      }
      await persist(next)
      current = next
      return structuredClone(next)
    })
  }
}
