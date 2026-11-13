import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PreferencesSnapshot } from '../shared/api'

export const PREFERENCES_VERSION = 1
export const MAX_PREFERENCES_BYTES = 1024 * 1024
const MAX_KEY_LENGTH = 512

export interface PreferencesStore {
  load(): Promise<PreferencesSnapshot>
  save(values: unknown): Promise<boolean>
}

/** Keys are the renderer's own namespaced names; values must be plain JSON. */
export function isPreferenceValues(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value).every(key => key.startsWith('reqora.') && key.length <= MAX_KEY_LENGTH)
}

/**
 * UI preferences (search options, scope, per-project search history) in
 * `preferences.json` next to the workspace, so they survive a change of host
 * or origin. Same write discipline as the workspace store: temporary file +
 * rename, serialized writes, unreadable files kept as `.corrupt-<ms>`.
 */
export function createPreferencesStore(directory: string): PreferencesStore {
  const file = join(directory, 'preferences.json')
  let queue: Promise<unknown> = Promise.resolve()

  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  async function read(): Promise<PreferencesSnapshot> {
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { initialized: false, values: {} }
      throw error
    }
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = undefined }
    const candidate = parsed as { version?: unknown; values?: unknown } | undefined
    if (candidate?.version === PREFERENCES_VERSION && isPreferenceValues(candidate.values)) {
      return { initialized: true, values: candidate.values }
    }
    // Keep the unreadable file; the renderer re-imports its browser-storage backup.
    await rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined)
    return { initialized: false, values: {} }
  }

  async function persist(values: Record<string, unknown>): Promise<void> {
    const text = JSON.stringify({ version: PREFERENCES_VERSION, values }, null, 2)
    if (Buffer.byteLength(text) > MAX_PREFERENCES_BYTES) throw new Error('The preferences are too large to save.')
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

  return {
    load: () => serialized(read),
    save: values => serialized(async () => {
      if (!isPreferenceValues(values)) return false
      try {
        await persist(values)
        return true
      } catch {
        return false
      }
    })
  }
}
