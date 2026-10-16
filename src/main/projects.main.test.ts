// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runRequest } from '../runner/run'
import { createDemoWorkspace } from '../workspace/demo'
import { createProject, deleteProject, duplicateProject } from '../workspace/projects'
import { sendHttp } from './http/sendRequest'
import { createSecretStore, type Cipher } from './secretStore'
import { annotateSecrets, extractSecrets } from './secretVariables'
import { createFileWorkspaceStore } from './workspaceStore'

const cipher: Cipher = {
  isEncryptionAvailable: () => true,
  encryptString: plain => Buffer.from(`enc:${Buffer.from(plain).toString('base64').split('').reverse().join('')}`),
  decryptString: data => Buffer.from(data.toString().slice(4).split('').reverse().join(''), 'base64').toString()
}

let directory = ''
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'reqora-projects-')) })
afterEach(() => rm(directory, { recursive: true, force: true }))

function storeWithSecrets() {
  const secrets = createSecretStore(directory, cipher)
  const store = createFileWorkspaceStore(directory, {
    beforePersist: workspace => extractSecrets(workspace, secrets),
    afterLoad: workspace => annotateSecrets(workspace, secrets)
  })
  return { secrets, store }
}

describe('migrating an existing single-project file', () => {
  it('loads a v1 file unchanged in content, backs it up once on the first save, and writes v2', async () => {
    const demo = createDemoWorkspace()
    const v1 = { ...demo, version: 1, revision: 3, projects: demo.projects.map(({ environments: _e, globals: _g, activeEnvironmentId: _a, ...rest }) => ({ ...rest, name: 'My existing API' })) }
    const original = JSON.stringify(v1, null, 2)
    await writeFile(join(directory, 'workspace.json'), original)
    const store = createFileWorkspaceStore(directory)
    const loaded = await store.load()
    expect(loaded).toMatchObject({ version: 2, revision: 3, projects: [{ name: 'My existing API', environments: [], globals: [] }] })
    expect(loaded.projects[0].endpoints).toHaveLength(demo.projects[0].endpoints.length)

    const saved = await store.save(createProject(loaded, 'Second').workspace)
    expect(saved.projects.map(project => project.name)).toEqual(['My existing API', 'Second'])
    expect(await readFile(join(directory, 'workspace.v1.backup.json'), 'utf8')).toBe(original)
    expect(JSON.parse(await readFile(join(directory, 'workspace.json'), 'utf8')).version).toBe(2)

    // A second save does not touch the backup.
    await writeFile(join(directory, 'workspace.v1.backup.json'), 'sentinel')
    await store.save(saved)
    expect(await readFile(join(directory, 'workspace.v1.backup.json'), 'utf8')).toBe('sentinel')
  })
})

describe('secret isolation between projects', () => {
  it('copies secrets to a duplicated project under new IDs and removes only the deleted project\'s secrets', async () => {
    const { secrets, store } = storeWithSecrets()
    const loaded = await store.load()
    loaded.projects[0].environments[0].variables.push({ id: 'v_token', key: 'token', value: 'tok-A', secret: true, enabled: true })
    const first = await store.save(loaded)
    const { workspace: withCopy, project: copy } = duplicateProject(first, 'commerce')
    const saved = await store.save(withCopy)
    const copiedVariable = saved.projects.find(project => project.id === copy!.id)!.environments[0].variables.find(variable => variable.key === 'token')!
    expect(copiedVariable).toMatchObject({ hasStoredSecret: true, value: '' })
    expect(copiedVariable.id).not.toBe('v_token')
    expect(await secrets.get(copiedVariable.id)).toBe('tok-A')

    // Changing the copy's secret does not affect the original.
    const edited = structuredClone(saved)
    edited.projects.find(project => project.id === copy!.id)!.environments[0].variables.find(variable => variable.key === 'token')!.value = 'tok-B'
    const afterEdit = await store.save(edited)
    expect(await secrets.get('v_token')).toBe('tok-A')
    expect(await secrets.get(copiedVariable.id)).toBe('tok-B')

    await store.save(deleteProject(afterEdit, copy!.id))
    expect(await secrets.ids()).toEqual(['v_token'])
    expect(await readFile(join(directory, 'workspace.json'), 'utf8')).not.toMatch(/tok-[AB]/)
  })
})

describe('sending is scoped to a project', () => {
  let server: Server
  let base = ''
  const hits: string[] = []
  beforeAll(async () => {
    server = createServer((request, response) => { hits.push(`${request.headers.host}${request.url}`); response.end('ok') })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => { server.closeAllConnections(); server.close() })

  it('uses the given project even when another project with the same endpoint IDs is active', async () => {
    const { workspace, project } = duplicateProject(createDemoWorkspace(), 'commerce')
    workspace.projects[0].environments[0].baseUrl = `http://${base}/original`
    workspace.projects.find(item => item.id === project!.id)!.environments[0].baseUrl = `http://${base}/copy`
    const run = (projectId?: string) => runRequest({ projectId, endpointId: 'get-users' }, {
      workspace, readSecret: async () => undefined, send: request => sendHttp(request, { timeoutMs: 2000, maxResponseBytes: 1000 })
    })
    await run('commerce')
    await run(project!.id)
    await run()
    expect(hits).toEqual([`${base}/original/v1/users`, `${base}/copy/v1/users`, `${base}/copy/v1/users`])
    expect(await run('missing')).toMatchObject({ ok: false, error: 'The project no longer exists.' })
  })
})
