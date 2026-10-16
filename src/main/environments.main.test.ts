// @vitest-environment node
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runRequest } from '../runner/run'
import { createDemoWorkspace } from '../workspace/demo'
import type { Variable, Workspace } from '../workspace/types'
import { sendHttp } from './http/sendRequest'
import { createSecretStore, SecretUnavailableError, type Cipher } from './secretStore'
import { annotateSecrets, extractSecrets } from './secretVariables'
import { createFileWorkspaceStore } from './workspaceStore'

/** Reversible stand-in for safeStorage: output never contains the plaintext. */
function fakeCipher(available = true): Cipher {
  return {
    isEncryptionAvailable: () => available,
    encryptString: plain => Buffer.from(`enc:${Buffer.from(plain, 'utf8').toString('base64').split('').reverse().join('')}`),
    decryptString: encrypted => Buffer.from(encrypted.toString().slice(4).split('').reverse().join(''), 'base64').toString('utf8')
  }
}

const SECRET = 'sk_live_TOPSECRET_42'
let directory = ''
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'reqora-env-')) })
afterEach(() => rm(directory, { recursive: true, force: true }))

function withVariables(workspace: Workspace, environment: Variable[], globals: Variable[] = []): Workspace {
  const project = workspace.projects[0]
  return {
    ...workspace,
    projects: [{
      ...project,
      environments: project.environments.map(item => item.id === 'env_local' ? { ...item, variables: environment } : item),
      globals
    }]
  }
}

async function diskText(): Promise<string> {
  const files = await readdir(directory)
  return (await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')))).join('\n')
}

describe('secret storage', () => {
  it('never writes secret values to disk in plain text, and annotates them on load', async () => {
    const secrets = createSecretStore(directory, fakeCipher())
    const store = createFileWorkspaceStore(directory, {
      beforePersist: workspace => extractSecrets(workspace, secrets),
      afterLoad: workspace => annotateSecrets(workspace, secrets)
    })
    const loaded = await store.load()
    const saved = await store.save(withVariables(loaded, [
      { id: 'v_token', key: 'token', value: SECRET, secret: true, enabled: true },
      { id: 'v_plain', key: 'plain', value: 'visible', secret: false, enabled: true }
    ]))
    const variables = saved.projects[0].environments[0].variables
    expect(variables[0]).toEqual({ id: 'v_token', key: 'token', value: '', secret: true, enabled: true, hasStoredSecret: true })
    expect(variables[1].value).toBe('visible')
    expect(await diskText()).not.toContain(SECRET)
    expect(await secrets.get('v_token')).toBe(SECRET)

    // A fresh process sees the flag but not the value.
    const reopened = createFileWorkspaceStore(directory, { afterLoad: workspace => annotateSecrets(workspace, createSecretStore(directory, fakeCipher())) })
    expect((await reopened.load()).projects[0].environments[0].variables[0]).toMatchObject({ value: '', hasStoredSecret: true })
  })

  it('keeps the stored secret when the value is left blank, copies on duplicate, and deletes orphans and un-secreted values', async () => {
    const secrets = createSecretStore(directory, fakeCipher())
    const base = createDemoWorkspace()
    await extractSecrets(withVariables(base, [{ id: 'a', key: 'k', value: SECRET, secret: true, enabled: true }]), secrets)
    await extractSecrets(withVariables(base, [
      { id: 'a', key: 'k', value: '', secret: true, enabled: true },
      { id: 'b', key: 'k', value: '', secret: true, enabled: true, copySecretFrom: 'a' }
    ]), secrets)
    expect(await secrets.get('a')).toBe(SECRET)
    expect(await secrets.get('b')).toBe(SECRET)
    const result = await extractSecrets(withVariables(base, [{ id: 'b', key: 'k', value: '', secret: false, enabled: true }]), secrets)
    expect(await secrets.ids()).toEqual([])
    expect(result.projects[0].environments[0].variables[0]).not.toHaveProperty('copySecretFrom')
  })

  it('refuses to store secrets when OS encryption is unavailable', async () => {
    const secrets = createSecretStore(directory, fakeCipher(false))
    await expect(secrets.set('x', SECRET)).rejects.toBeInstanceOf(SecretUnavailableError)
    const store = createFileWorkspaceStore(directory, { beforePersist: workspace => extractSecrets(workspace, secrets) })
    const loaded = await store.load()
    await expect(store.save(withVariables(loaded, [{ id: 'a', key: 'k', value: SECRET, secret: true, enabled: true }]))).rejects.toThrow('Secure storage is not available')
    expect(await diskText().catch(() => '')).not.toContain(SECRET)
  })
})

describe('sending through the main-process runner (loopback only)', () => {
  let server: Server
  let base = ''
  let received: { method?: string; url?: string; headers: IncomingHttpHeaders; body: string }[] = []
  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        received.push({ method: request.method, url: request.url, headers: request.headers, body })
        if (request.url?.startsWith('/slow')) return
        response.setHeader('content-type', 'application/json')
        response.setHeader('x-echo', String(request.headers['x-api-key'] ?? ''))
        response.end(JSON.stringify({ youSent: request.headers['x-api-key'], path: request.url }))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => { server.closeAllConnections(); server.close() })
  beforeEach(() => { received = [] })

  async function run(workspace: Workspace, endpointId = 'get-user', timeoutMs = 2000) {
    const secrets = createSecretStore(directory, fakeCipher())
    await secrets.set('v_key', SECRET)
    return runRequest({ endpointId }, {
      workspace,
      readSecret: variable => secrets.get(variable.id),
      send: request => sendHttp(request, { timeoutMs, maxResponseBytes: 1 << 20 })
    })
  }

  it('resolves environment and global variables (environment first), sends the secret, and masks it in everything returned', async () => {
    const demo = createDemoWorkspace()
    const workspace = withVariables(demo, [
      { id: 'v_user', key: 'userId', value: 'usr_env', secret: false, enabled: true },
      { id: 'v_key', key: 'apiKey', value: '', secret: true, enabled: true }
    ], [{ id: 'g_user', key: 'userId', value: 'usr_global', secret: false, enabled: true }])
    workspace.projects[0].environments[0].baseUrl = base
    const endpoint = workspace.projects[0].endpoints.find(item => item.id === 'get-user')!
    endpoint.pathParams = [{ key: 'userId', value: '{{userId}}', enabled: true }]
    endpoint.headers = [{ key: 'X-Api-Key', value: '{{apiKey}}', enabled: true }]
    const result = await run(workspace)
    expect(received[0]).toMatchObject({ method: 'GET', url: '/v1/users/usr_env' })
    expect(received[0].headers['x-api-key']).toBe(SECRET)
    expect(result.ok).toBe(true)
    expect(result.response?.status).toBe(200)
    expect(JSON.stringify(result)).not.toContain(SECRET)
    expect(result.request?.headers).toContainEqual(['X-Api-Key', '••••••'])
    expect(JSON.parse(result.response!.body).youSent).toBe('••••••')
  })

  it('reports unresolved variables, unreachable hosts and timeouts as data, never as thrown errors', async () => {
    const workspace = createDemoWorkspace()
    workspace.projects[0].activeEnvironmentId = null
    const noBase = await run(workspace)
    expect(noBase).toMatchObject({ ok: false, error: expect.stringContaining('is not a complete URL') })
    workspace.projects[0].endpoints[0].path = `${base}/slow/{{missing}}`
    const slow = await run(workspace, workspace.projects[0].endpoints[0].id, 200)
    expect(slow).toMatchObject({ ok: false, error: 'No response within 0.2 seconds.', unresolved: ['missing'] })
    expect(await run(workspace, 'nope')).toMatchObject({ ok: false, error: 'The endpoint no longer exists.' })
  })
})
