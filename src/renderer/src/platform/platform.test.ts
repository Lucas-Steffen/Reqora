import { describe, expect, it } from 'vitest'
import type { ReqoraApi } from '../../../shared/api'
import { desktopApi, detectPlatform } from './index'
import { createMemoryPlatform } from './memory'

const api = {} as ReqoraApi

describe('platform detection', () => {
  it('uses the Electron preload API when present', () => {
    expect(detectPlatform({ reqora: api })).toBe('electron')
    expect(desktopApi({ reqora: api })).toBe(api)
  })

  it('recognises Tauri without exposing a backend yet', () => {
    const host = { reqora: undefined, __TAURI_INTERNALS__: {} }
    expect(detectPlatform(host)).toBe('tauri')
    expect(desktopApi(host)).toBeUndefined()
  })

  it('falls back to the browser', () => {
    expect(detectPlatform({ reqora: undefined })).toBe('browser')
    expect(detectPlatform(undefined)).toBe('browser')
    expect(desktopApi({ reqora: undefined })).toBeUndefined()
  })
})

describe('memory platform', () => {
  it('keeps saves in memory', async () => {
    const platform = createMemoryPlatform(() => null)
    const loaded = await platform.workspace.load()
    const saved = await platform.workspace.save({ ...loaded })
    expect(saved.revision).toBe(loaded.revision + 1)
    expect((await platform.workspace.load()).revision).toBe(saved.revision)
  })
})
