import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreferencesSnapshot } from '../../shared/api'
import {
  flushPreferences,
  HISTORY_KEY,
  historyKey,
  initPreferences,
  migrateLegacyHistory,
  OPTIONS_KEY,
  readHistory,
  readScope,
  removePreference,
  resetPreferences,
  savePreference,
  SCOPE_KEY
} from './preferences'

function fakeBackend(snapshot: PreferencesSnapshot) {
  const saved: Record<string, unknown>[] = []
  let release: () => void = () => {}
  const api = {
    load: vi.fn(async () => snapshot),
    save: vi.fn(async (values: Record<string, unknown>) => {
      saved.push(structuredClone(values))
      await new Promise<void>(done => { release = done; queueMicrotask(done) })
      return true
    })
  }
  return { api, saved, release: () => release() }
}

beforeEach(() => localStorage.clear())
afterEach(() => resetPreferences())

describe('preferences backend', () => {
  it('imports browser preferences once on the first run and keeps them as a backup', async () => {
    localStorage.setItem(SCOPE_KEY, '"all"')
    localStorage.setItem(historyKey('p1'), '["users"]')
    localStorage.setItem(OPTIONS_KEY, '{broken')
    localStorage.setItem('unrelated', '1')
    const { api, saved } = fakeBackend({ initialized: false, values: {} })
    await initPreferences(api)
    expect(saved).toEqual([{ [SCOPE_KEY]: 'all', [historyKey('p1')]: ['users'] }])
    expect(readScope()).toBe('all')
    expect(readHistory(historyKey('p1'))).toEqual(['users'])
    expect(localStorage.getItem(SCOPE_KEY)).toBe('"all"')
  })

  it('reads only the backend once it is initialized', async () => {
    localStorage.setItem(SCOPE_KEY, '"all"')
    const { api, saved } = fakeBackend({ initialized: true, values: { [historyKey('p1')]: ['orders'] } })
    await initPreferences(api)
    expect(saved).toEqual([])
    expect(readScope()).toBe('project')
    expect(readHistory(historyKey('p1'))).toEqual(['orders'])
  })

  it('persists writes and deletions, coalescing bursts to the newest state', async () => {
    const { api, saved } = fakeBackend({ initialized: true, values: {} })
    await initPreferences(api)
    savePreference(SCOPE_KEY, 'all')
    savePreference(historyKey('p1'), ['a'])
    savePreference(historyKey('p1'), ['b', 'a'])
    await flushPreferences()
    removePreference(historyKey('p1'))
    await flushPreferences()
    expect(saved.at(-2)).toEqual({ [SCOPE_KEY]: 'all', [historyKey('p1')]: ['b', 'a'] })
    expect(saved.at(-1)).toEqual({ [SCOPE_KEY]: 'all' })
    expect(saved.length).toBeLessThanOrEqual(3)
    expect(localStorage.length).toBe(0)
  })

  it('moves the legacy global history inside the backend', async () => {
    const { api, saved } = fakeBackend({ initialized: true, values: { [HISTORY_KEY]: ['legacy'] } })
    await initPreferences(api)
    migrateLegacyHistory('p1')
    await flushPreferences()
    expect(readHistory(historyKey('p1'))).toEqual(['legacy'])
    expect(saved.at(-1)).toEqual({ [historyKey('p1')]: ['legacy'] })
  })

  it('falls back to browser storage when the backend cannot be read', async () => {
    localStorage.setItem(SCOPE_KEY, '"all"')
    await initPreferences({ load: async () => { throw new Error('offline') }, save: async () => true })
    expect(readScope()).toBe('all')
    savePreference(SCOPE_KEY, 'project')
    expect(localStorage.getItem(SCOPE_KEY)).toBe('"project"')
  })

  it('uses browser storage when there is no backend', async () => {
    await initPreferences(undefined)
    savePreference(SCOPE_KEY, 'all')
    expect(localStorage.getItem(SCOPE_KEY)).toBe('"all"')
  })
})
