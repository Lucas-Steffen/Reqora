// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPreferencesStore, MAX_PREFERENCES_BYTES } from './preferencesStore'

let directory = ''
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'reqora-preferences-')) })
afterEach(() => rm(directory, { recursive: true, force: true }))

describe('preferences store', () => {
  it('reports an uninitialized store until the first save', async () => {
    const store = createPreferencesStore(directory)
    expect(await store.load()).toEqual({ initialized: false, values: {} })
    expect(await store.save({ 'reqora.search.scope.v1': 'all' })).toBe(true)
    expect(await createPreferencesStore(directory).load()).toEqual({ initialized: true, values: { 'reqora.search.scope.v1': 'all' } })
    expect(JSON.parse(await readFile(join(directory, 'preferences.json'), 'utf8'))).toEqual({ version: 1, values: { 'reqora.search.scope.v1': 'all' } })
  })

  it('applies concurrent saves in order and leaves no temporary files', async () => {
    const store = createPreferencesStore(directory)
    await Promise.all(Array.from({ length: 10 }, (_, index) => store.save({ 'reqora.search.history.v1:p': [`q${index}`] })))
    expect((await store.load()).values).toEqual({ 'reqora.search.history.v1:p': ['q9'] })
    expect(await readdir(directory)).toEqual(['preferences.json'])
  })

  it('rejects foreign keys, non-objects and oversized payloads without touching the file', async () => {
    const store = createPreferencesStore(directory)
    await store.save({ 'reqora.search.scope.v1': 'project' })
    expect(await store.save({ other: 1 })).toBe(false)
    expect(await store.save(['reqora.x'])).toBe(false)
    expect(await store.save(null)).toBe(false)
    expect(await store.save({ [`reqora.${'k'.repeat(600)}`]: 1 })).toBe(false)
    expect(await store.save({ 'reqora.big': 'x'.repeat(MAX_PREFERENCES_BYTES) })).toBe(false)
    expect((await store.load()).values).toEqual({ 'reqora.search.scope.v1': 'project' })
    expect(await readdir(directory)).toEqual(['preferences.json'])
  })

  it('keeps an unreadable file aside and starts uninitialized', async () => {
    await writeFile(join(directory, 'preferences.json'), '{broken')
    expect(await createPreferencesStore(directory).load()).toEqual({ initialized: false, values: {} })
    const files = await readdir(directory)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^preferences\.json\.corrupt-\d+$/)
    expect(await readFile(join(directory, files[0]), 'utf8')).toBe('{broken')
  })

  it('treats an unknown version as unreadable instead of guessing its format', async () => {
    await writeFile(join(directory, 'preferences.json'), JSON.stringify({ version: 2, values: {} }))
    expect((await createPreferencesStore(directory).load()).initialized).toBe(false)
    expect((await readdir(directory))[0]).toMatch(/\.corrupt-\d+$/)
  })
})
