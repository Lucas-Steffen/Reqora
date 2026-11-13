import { describe, expect, it, vi } from 'vitest'
import contract from '../../../shared/contract/ipc-commands.json'
import { BACKEND_ERROR_CODES, COMMANDS, IPC, type ReqoraApi } from '../../../shared/api'
import type { RunInput } from '../../../runner/run'
import type { Endpoint, Project, Variable, Workspace } from '../../../workspace/types'
import { createDemoWorkspace } from '../../../workspace/demo'
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

function secretVar(id: string, key: string, extra: Partial<Variable> = {}): Variable {
  return { id, key, value: '', secret: true, enabled: true, ...extra }
}

function project(id: string, path: string, variables: Variable[]): Project {
  const endpoint: Endpoint = {
    id: 'e1', name: 'List pets', method: 'GET', path, tags: [], query: [], pathParams: [], cookies: [], responses: [],
    headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }],
    body: { mode: 'none' }
  }
  return {
    id, name: id, folders: [], endpoints: [endpoint], resources: [], importSources: [], globals: [],
    environments: [{ id: 'env', name: 'Dev', baseUrl: '', variables }], activeEnvironmentId: 'env'
  }
}

function sendWorkspace(path = 'https://api.test/pets?key={{token}}'): Workspace {
  return {
    version: 2, revision: 1, activeProjectId: 'p1',
    projects: [
      project('p1', path, [
        secretVar('v_token', 'token', { hasStoredSecret: true }),
        secretVar('v_nostore', 'nostore'),
        { id: 'v_plain', key: 'plain', value: 'visible', secret: false, enabled: true }
      ]),
      project('p2', path, [secretVar('v_other', 'token', { hasStoredSecret: true })])
    ]
  }
}

const sendReply = { response: { status: 200, statusText: 'OK', headers: [], body: 'ok', truncated: false, sizeBytes: 2, url: 'https://api.test/pets' }, unresolved: ['extra'] }

interface SentInput { projectId: string; prepared: { url: string; headers: [string, string][] }; secretRefs: Record<string, string> }
const sentInput = (call: { args?: Record<string, unknown> }) => call.args!.input as SentInput

/** One call per contract entry, through the adapter. */
const exercise: Record<keyof typeof IPC, (api: Partial<ReqoraApi>) => Promise<unknown>> = {
  workspaceLoad: api => api.workspace!.load(),
  workspaceSave: api => api.workspace!.save(workspace),
  importPick: api => api.importer!.pickFile(),
  importPath: async () => undefined,
  importUrl: api => api.importer!.fromUrl('https://example.com/openapi.json'),
  importCancel: api => api.importer!.cancel!(),
  requestSend: api => api.request!.send({ endpointId: 'e1' } as RunInput),
  requestCancel: api => api.request!.cancel!(),
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
    const { invoke, calls } = fakeInvoke(command => (command === COMMANDS.workspaceLoad ? null : command === COMMANDS.requestSend ? sendReply : { ok: true, workspace }))
    await exercise[key as keyof typeof IPC](createTauriApi(invoke, ALL, () => sendWorkspace()))
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

describe('Tauri workspace load', () => {
  it('seeds the demo on first run', async () => {
    const { invoke } = fakeInvoke(() => null)
    const loaded = await createTauriApi(invoke, ALL).workspace!.load()
    expect({ ...loaded, projects: loaded.projects.length }).toMatchObject({ version: 2, revision: 0, projects: createDemoWorkspace().projects.length })
  })

  it('migrates an older format in the renderer, as the Electron store does', async () => {
    const demo = createDemoWorkspace()
    const v1 = JSON.parse(JSON.stringify({ ...demo, version: 1, revision: 7, activeProjectId: 'gone', projects: demo.projects.map(({ environments: _e, globals: _g, activeEnvironmentId: _a, ...rest }) => rest) }))
    const { invoke } = fakeInvoke(() => v1)
    const loaded = await createTauriApi(invoke, ALL).workspace!.load()
    expect(loaded).toMatchObject({ version: 2, revision: 7, activeProjectId: demo.projects[0].id })
    expect(loaded.projects[0]).toMatchObject({ environments: [], globals: [], activeEnvironmentId: null })
  })

  it('rejects a reply that is not a workspace', async () => {
    const { invoke } = fakeInvoke(() => ({ version: 2, revision: 0, projects: [] }))
    await expect(createTauriApi(invoke, ALL).workspace!.load()).rejects.toMatchObject({ name: 'PlatformError', code: 'INVALID' })
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
    expect(Object.keys(createTauriApi(invoke)).sort()).toEqual(['secrets', 'workspace'])
    const some = createTauriApi(invoke, { ...ALL, importer: false, request: false })
    expect(Object.keys(some).sort()).toEqual(['preferences', 'secrets', 'workspace'])
    // Sending needs the renderer's workspace: no getter, no request area.
    expect(Object.keys(createTauriApi(invoke, ALL)).sort()).toEqual(['importer', 'preferences', 'secrets', 'workspace'])
    expect(Object.keys(createTauriApi(invoke, ALL, () => null)).sort()).toEqual(['importer', 'preferences', 'request', 'secrets', 'workspace'])
  })
})

describe('Tauri request send (ADR-010)', () => {
  const PLACEHOLDER = /^rqs_[0-9a-f]{32}_\d+$/

  function sendApi(workspace: Workspace | null = sendWorkspace(), reply: (command: string) => unknown = () => sendReply) {
    const fake = fakeInvoke(reply)
    return { ...fake, api: createTauriApi(fake.invoke, ALL, () => workspace) }
  }

  it('sends placeholders where secrets go and maps them to the variable ids', async () => {
    const { api, calls } = sendApi()
    const result = await api.request!.send({ endpointId: 'e1' })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe(COMMANDS.requestSend)
    const input = sentInput(calls[0])
    expect(input.projectId).toBe('p1')
    const [placeholder, id] = Object.entries(input.secretRefs)[0]
    expect(placeholder).toMatch(PLACEHOLDER)
    expect(id).toBe('v_token')
    expect(input.prepared.url).toBe(`https://api.test/pets?key=${placeholder}`)
    expect(input.prepared.headers).toContainEqual(['Authorization', `Bearer ${placeholder}`])
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result.request)).not.toMatch(/rqs_[0-9a-f]{32}/)
    expect(result.response).toMatchObject({ status: 200, body: 'ok' })
    expect(typeof result.response!.timeMs).toBe('number')
  })

  it('uses a fresh nonce on every send', async () => {
    const { api, calls } = sendApi()
    await api.request!.send({ endpointId: 'e1' })
    await api.request!.send({ endpointId: 'e1' })
    const [first, second] = calls.map(call => Object.keys(sentInput(call).secretRefs)[0])
    expect(first).not.toBe(second)
  })

  it('leaves a secret without a stored value literal and reports it', async () => {
    const { api, calls } = sendApi(sendWorkspace('https://api.test/pets?key={{nostore}}'))
    const result = await api.request!.send({ endpointId: 'e1' })
    const input = sentInput(calls[0])
    expect(input.prepared.url).toBe('https://api.test/pets?key={{nostore}}')
    expect(Object.values(input.secretRefs)).not.toContain('v_nostore')
    expect(result.unresolved).toContain('nostore')
  })

  it('sends only the secrets the request uses', async () => {
    const workspace = sendWorkspace('https://api.test/pets')
    workspace.projects[0].endpoints[0].headers = []
    const { api, calls } = sendApi(workspace)
    await api.request!.send({ endpointId: 'e1' })
    expect(sentInput(calls[0]).secretRefs).toEqual({})
  })

  it('refers to the secrets of the project that owns the endpoint', async () => {
    const { api, calls } = sendApi()
    await api.request!.send({ projectId: 'p2', endpointId: 'e1' })
    const input = sentInput(calls[0])
    expect(input.projectId).toBe('p2')
    expect(Object.values(input.secretRefs)).toEqual(['v_other'])
  })

  it('keeps {{secret.path}} unresolved (accepted difference)', async () => {
    const { api, calls } = sendApi(sendWorkspace('https://api.test/pets?key={{token.id}}'))
    const result = await api.request!.send({ endpointId: 'e1' })
    expect(sentInput(calls[0]).prepared.url).toBe('https://api.test/pets?key={{token.id}}')
    expect(result.unresolved).toContain('token.id')
  })

  it('merges the keys the backend could not open, without duplicates', async () => {
    const { api } = sendApi(sendWorkspace('https://api.test/pets?key={{nostore}}'), () => ({ ...sendReply, unresolved: ['nostore', 'token'] }))
    const result = await api.request!.send({ endpointId: 'e1' })
    expect(result.unresolved.filter(key => key === 'nostore')).toHaveLength(1)
    expect(result.unresolved).toContain('token')
  })

  it('turns a transport rejection into a failed result with its code', async () => {
    const { api } = sendApi(sendWorkspace(), () => { throw { code: 'TIMEOUT', message: 'No response within 30 seconds.' } })
    const result = await api.request!.send({ endpointId: 'e1' })
    expect(result).toMatchObject({ ok: false, errorCode: 'TIMEOUT', error: 'No response within 30 seconds.' })
  })

  it('does not send while the workspace is loading', async () => {
    const { api, calls } = sendApi(null)
    await expect(api.request!.send({ endpointId: 'e1' })).resolves.toEqual({ ok: false, error: 'The workspace is still loading.', unresolved: [] })
    expect(calls).toHaveLength(0)
  })

  it('cancels through request_cancel', async () => {
    const { api, calls } = sendApi()
    await api.request!.cancel!()
    expect(calls).toEqual([{ command: COMMANDS.requestCancel, args: undefined }])
  })
})
