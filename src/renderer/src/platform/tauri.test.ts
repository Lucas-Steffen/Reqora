import { describe, expect, it, vi } from 'vitest'
import contract from '../../../shared/contract/ipc-commands.json'
import { BACKEND_ERROR_CODES, COMMANDS, IPC, type ReqoraApi } from '../../../shared/api'
import type { RunInput } from '../../../runner/run'
import type { Workspace } from '../../../workspace/types'
import { createTauriApi, PlatformError, toPlatformError, type Invoke, type TauriBackend } from './tauri'

const ALL: TauriBackend = { workspace: true, importer: true, request: true, secrets: true, preferences: true }
const workspace = { version: 2, revision: 3, projects: [] } as unknown as Workspace

function fakeInvoke(reply: (command: string, args?: Record<string, unknown>) => unknown = () => null) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args })
    return reply(command, args)
  }) as unknown as Invoke
  return { invoke, calls }
}

/** One call per contract entry, through the adapter. */
const exercise: Record<keyof typeof IPC, (api: Partial<ReqoraApi>) => Promise<unknown>> = {
  workspaceLoad: api => api.workspace!.load(),
  workspaceSave: api => api.workspace!.save(workspace),
  importPick: api => api.importer!.pickFile(),
  importPath: async () => undefined,
  importUrl: api => api.importer!.fromUrl('https://example.com/openapi.json'),
  importCancel: api => api.importer!.cancel!(),
  requestSend: api => api.request!.send({} as RunInput),
  secretReveal: api => api.secrets!.reveal('variable-1'),
  preferencesLoad: api => api.preferences!.load(),
  preferencesSave: api => api.preferences!.save({ scope: 'all' })
}

describe('Tauri command contract', () => {
  it('names every IPC channel with the fixture command', () => {
    expect(Object.keys(COMMANDS).sort()).toEqual(Object.keys(IPC).sort())
    expect(Object.keys(contract.commands).sort()).toEqual(Object.keys(IPC).sort())
    for (const [key, entry] of Object.entries(contract.commands)) {
      expect(COMMANDS[key as keyof typeof COMMANDS]).toBe(entry.name)
    }
    expect([...BACKEND_ERROR_CODES]).toEqual(contract.errorCodes)
  })

  it.each(Object.keys(contract.commands).filter(key => key !== 'importPath'))('sends %s with the fixture argument keys', async key => {
    const { invoke, calls } = fakeInvoke(() => ({ ok: true, workspace }))
    await exercise[key as keyof typeof IPC](createTauriApi(invoke, ALL))
    const entry = contract.commands[key as keyof typeof contract.commands]
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe(entry.name)
    expect(Object.keys(calls[0].args ?? {})).toEqual(entry.args.map(arg => arg.js))
  })

  it('passes arguments through unchanged', async () => {
    const { invoke, calls } = fakeInvoke()
    const api = createTauriApi(invoke, ALL)
    await api.secrets!.reveal('variable-1')
    await api.importer!.fromUrl('https://example.com/a.yaml')
    expect(calls.map(call => call.args)).toEqual([{ variableId: 'variable-1' }, { url: 'https://example.com/a.yaml' }])
  })
})

describe('Tauri adapter errors', () => {
  it('normalizes rejections', () => {
    expect(toPlatformError(contract.errorSample)).toMatchObject({ code: 'STALE', message: contract.errorSample.message })
    expect(toPlatformError('command workspace_load not found')).toMatchObject({ code: 'UNKNOWN', message: 'command workspace_load not found' })
    expect(toPlatformError(new Error('boom'))).toMatchObject({ code: 'IPC', message: 'boom' })
    expect(toPlatformError(undefined)).toBeInstanceOf(PlatformError)
  })

  it('turns backend save errors into a save outcome', async () => {
    for (const code of BACKEND_ERROR_CODES) {
      const invoke = (async () => { throw { code, message: `failed with ${code}` } }) as Invoke
      await expect(createTauriApi(invoke, ALL).workspace!.save(workspace)).resolves.toEqual({ ok: false, code, message: `failed with ${code}` })
    }
  })

  it('rejects other failures with a PlatformError', async () => {
    const invoke = (async () => { throw 'invalid args `workspace` for command `workspace_save`' }) as Invoke
    const api = createTauriApi(invoke, ALL)
    await expect(api.workspace!.save(workspace)).rejects.toMatchObject({ name: 'PlatformError', code: 'UNKNOWN' })
    await expect(api.workspace!.load()).rejects.toMatchObject({ code: 'UNKNOWN' })
  })

  it('returns a successful save outcome as is', async () => {
    const { invoke } = fakeInvoke(() => ({ ok: true, workspace }))
    await expect(createTauriApi(invoke, ALL).workspace!.save(workspace)).resolves.toEqual({ ok: true, workspace })
  })

  it('reports dropped files as unavailable until drag-drop lands', async () => {
    const { invoke, calls } = fakeInvoke()
    const outcome = await createTauriApi(invoke, ALL).importer!.fromDroppedFile({} as File)
    expect(outcome).toMatchObject({ ok: false, error: { code: 'FILE' } })
    expect(calls).toHaveLength(0)
  })
})

describe('Tauri backend areas', () => {
  it('exposes only the areas the backend implements', () => {
    const { invoke } = fakeInvoke()
    expect(createTauriApi(invoke)).toEqual({})
    const some = createTauriApi(invoke, { ...ALL, importer: false, request: false })
    expect(Object.keys(some).sort()).toEqual(['preferences', 'secrets', 'workspace'])
    expect(Object.keys(createTauriApi(invoke, ALL)).sort()).toEqual(['importer', 'preferences', 'request', 'secrets', 'workspace'])
  })
})
