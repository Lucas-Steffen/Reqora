// @vitest-environment node
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { importDocument, planImport } from '../importer/pipeline'
import { resolveBaseUrl } from '../runner/baseUrl'
import { prepareRequest } from '../runner/prepare'
import { runRequest } from '../runner/run'
import { emptyScopes } from '../environments/variables'
import { createDemoWorkspace } from '../workspace/demo'
import type { Project, Workspace } from '../workspace/types'
import { classifySendError, sendHttp } from './http/sendRequest'
import { createImportService } from './importService'

/** Local mock API: serves its own OpenAPI document and echoes every other request. */
let server: Server
let base = ''
let received: { method?: string; url?: string; headers: IncomingHttpHeaders; body: string }[] = []
const spec = () => ({
  openapi: '3.0.3',
  info: { title: 'Mock Pets', version: '1' },
  servers: [{ url: '/api', description: 'Mock' }, { url: 'https://staging.pets.test/api', description: 'Staging' }],
  paths: {
    '/pets': {
      get: { tags: ['Pets'], summary: 'List pets', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', example: 5 } }], responses: { 200: { description: 'ok' } } },
      post: { tags: ['Pets'], summary: 'Create pet', requestBody: { content: { 'application/json': { example: { name: 'Rex' } } } }, responses: { 201: { description: 'created' } } }
    },
    '/pets/{petId}': {
      get: { tags: ['Pets'], summary: 'Get pet', parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'X-Trace', in: 'header', example: 't-1', schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } }
    },
    '/status': { servers: [{ url: '/ops' }], get: { summary: 'Status', responses: { 200: { description: 'ok' } } } }
  }
})

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      if (request.url === '/openapi.json') {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify(spec()))
        return
      }
      received.push({ method: request.method, url: request.url, headers: request.headers, body })
      response.writeHead(request.method === 'POST' ? 201 : 200, { 'content-type': 'application/json', 'x-mock': 'yes' })
      response.end(JSON.stringify({ method: request.method, url: request.url, body: body || null }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.closeAllConnections(); server.close() })
beforeEach(() => { received = [] })

async function importedWorkspace(options: { serversAsEnvironments?: boolean; keepDemoEnvironment?: boolean } = {}): Promise<Workspace> {
  const outcome = await createImportService().fromUrl(`${base}/openapi.json`)
  if (!outcome.ok) throw new Error(outcome.error.message)
  const workspace = createDemoWorkspace()
  const project = workspace.projects[0]
  const plan = planImport(project, outcome.spec, outcome.origin, { grouping: 'tags', mode: 'merge', now: 'now', serversAsEnvironments: options.serversAsEnvironments })
  // Reproduces the reported bug setup: an unrelated environment (demo "Local", 127.0.0.1:4010) is active.
  expect(plan.project.activeEnvironmentId).toBe('env_local')
  return { ...workspace, projects: [plan.project] }
}

const send = (workspace: Workspace, endpointName: string, edit?: (draft: Parameters<typeof prepareRequest>[0]) => void) => {
  const endpoint = workspace.projects[0].endpoints.find(item => item.name === endpointName)!
  const draft = {
    method: endpoint.method, url: endpoint.path, query: endpoint.query, headers: endpoint.headers,
    pathParams: endpoint.pathParams, cookies: endpoint.cookies, body: endpoint.body
  }
  edit?.(draft)
  return runRequest({ endpointId: endpoint.id, draft }, {
    workspace,
    readSecret: async () => undefined,
    send: request => sendHttp(request, { timeoutMs: 2000, maxResponseBytes: 1 << 20 })
  })
}

describe('sending imported endpoints (root-cause regression, local mock server only)', () => {
  it('stores the document servers, resolving relative ones against the document URL', async () => {
    const workspace = await importedWorkspace()
    const project = workspace.projects[0]
    expect(project.importSources[0].servers).toEqual([`${base}/api`, 'https://staging.pets.test/api'])
    expect(project.endpoints.find(endpoint => endpoint.name === 'Status')?.servers).toEqual([`${base}/ops`])
  })

  it('sends to the spec server even when an unrelated environment is active, with query, header and path params', async () => {
    const workspace = await importedWorkspace()
    const list = await send(workspace, 'List pets')
    expect(list.ok).toBe(true)
    expect(received[0]).toMatchObject({ method: 'GET', url: '/api/pets?limit=5' })
    expect(list.response).toMatchObject({ status: 200, statusText: 'OK', url: `${base}/api/pets?limit=5` })
    expect(list.response!.headers).toContainEqual(['x-mock', 'yes'])
    expect(list.response!.sizeBytes).toBeGreaterThan(0)
    expect(list.response!.timeMs).toBeGreaterThanOrEqual(0)

    const get = await send(workspace, 'Get pet', draft => { draft.pathParams = [{ key: 'petId', value: '{{petId}}', enabled: true }] })
    expect(get).toMatchObject({ ok: false, errorCode: 'MISSING_PATH_PARAM', error: 'Fill in path parameter(s) before sending: petId.' })
    expect(received).toHaveLength(1)

    workspace.projects[0].globals.push({ id: 'g', key: 'petId', value: 'p 7', secret: false, enabled: true })
    const filled = await send(workspace, 'Get pet', draft => { draft.pathParams = [{ key: 'petId', value: '{{petId}}', enabled: true }] })
    expect(filled.ok).toBe(true)
    expect(received[1]).toMatchObject({ url: '/api/pets/p%207' })
    expect(received[1].headers['x-trace']).toBe('t-1')

    const status = await send(workspace, 'Status')
    expect(received[2].url).toBe('/ops/status')
    expect(status.ok).toBe(true)
  })

  it('sends JSON bodies and shows the response body', async () => {
    const workspace = await importedWorkspace()
    const created = await send(workspace, 'Create pet')
    expect(received[0]).toMatchObject({ method: 'POST', url: '/api/pets', body: '{\n  "name": "Rex"\n}' })
    expect(received[0].headers['content-type']).toBe('application/json')
    expect(created.response?.status).toBe(201)
    expect(JSON.parse(created.response!.body)).toMatchObject({ method: 'POST' })
  })

  it('lets an environment service URL override the spec server for that source', async () => {
    const workspace = await importedWorkspace()
    const project = workspace.projects[0]
    const sourceId = project.importSources[0].id
    project.environments[0].serviceUrls = { [sourceId]: `${base}/v2` }
    await send(workspace, 'List pets')
    expect(received[0].url).toBe('/v2/pets?limit=5')
    expect(resolveBaseUrl(project, project.endpoints.find(endpoint => endpoint.name === 'List pets')!, '/pets')).toMatchObject({ origin: 'environment-service', label: 'Local → Mock Pets' })
  })

  it('can create environments from the document servers', async () => {
    const outcome = await createImportService().fromUrl(`${base}/openapi.json`)
    if (!outcome.ok) throw new Error(outcome.error.message)
    const empty: Project = { ...createDemoWorkspace().projects[0], environments: [], activeEnvironmentId: null }
    const plan = planImport(empty, outcome.spec, outcome.origin, { grouping: 'tags', mode: 'merge', now: 'now', serversAsEnvironments: true })
    expect(plan.project.environments.map(environment => [environment.name, environment.baseUrl])).toEqual([['Mock', `${base}/api`], ['Staging', 'https://staging.pets.test/api']])
    expect(plan.project.activeEnvironmentId).toBe(plan.project.environments[0].id)
    const again = planImport(plan.project, outcome.spec, outcome.origin, { grouping: 'tags', mode: 'merge', now: 'now', serversAsEnvironments: true })
    expect(again.project.environments).toHaveLength(2)
  })
})

describe('base URL resolution order', () => {
  const project = (): Project => ({
    ...createDemoWorkspace().projects[0],
    importSources: [{ id: 's', kind: 'url', location: 'x', title: 'Svc', specVersion: 'OpenAPI 3.0.0', grouping: 'tags', importedAt: 'now', servers: ['https://spec.test'] }]
  })
  it('follows absolute > environment service URL > endpoint server > source server > environment base URL > none', () => {
    const p = project()
    const imported = { source: { sourceId: 's', key: 'GET /a' } }
    expect(resolveBaseUrl(p, imported, 'https://abs.test/a').origin).toBe('absolute')
    expect(resolveBaseUrl(p, imported, '{{host}}/a').origin).toBe('absolute')
    expect(resolveBaseUrl(p, { ...imported, servers: ['https://op.test'] }, '/a')).toMatchObject({ baseUrl: 'https://op.test', origin: 'endpoint-server' })
    expect(resolveBaseUrl(p, imported, '/a')).toMatchObject({ baseUrl: 'https://spec.test', origin: 'source-server' })
    p.environments[0].serviceUrls = { s: 'https://env-svc.test' }
    expect(resolveBaseUrl(p, imported, '/a')).toMatchObject({ baseUrl: 'https://env-svc.test', origin: 'environment-service' })
    expect(resolveBaseUrl(p, {}, '/a')).toMatchObject({ baseUrl: 'http://127.0.0.1:4010', origin: 'environment' })
    expect(resolveBaseUrl({ ...p, activeEnvironmentId: null }, {}, '/a').origin).toBe('none')
  })

  it('leaves single-brace path placeholders without values as missing, but not {{variables}}', () => {
    const prepared = prepareRequest({ method: 'GET', url: '/a/{id}/{{v}}/{other}?q={x}', query: [], headers: [], cookies: [], body: { mode: 'none' }, pathParams: [{ key: 'id', value: '', enabled: true }] }, emptyScopes(), 'https://b.test')
    expect(prepared.missingPathParams).toEqual(['id', 'other'])
  })
})

describe('transport error classification', () => {
  const url = new URL('https://api.example.invalid:8443/x')
  const wrapped = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) })
  it.each([
    ['ENOTFOUND', 'DNS', 'DNS lookup failed: "api.example.invalid" could not be resolved (ENOTFOUND).'],
    ['EAI_AGAIN', 'DNS', 'could not be resolved'],
    ['ECONNREFUSED', 'REFUSED', 'Connection refused by api.example.invalid:8443'],
    ['ECONNRESET', 'RESET', 'closed unexpectedly'],
    ['UND_ERR_CONNECT_TIMEOUT', 'TIMEOUT', 'timed out'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'TLS', 'TLS/certificate error for api.example.invalid:8443 (DEPTH_ZERO_SELF_SIGNED_CERT)'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS', 'not trusted for this host'],
    ['CERT_HAS_EXPIRED', 'TLS', 'CERT_HAS_EXPIRED'],
    ['EWHATEVER', 'NETWORK', 'Could not reach api.example.invalid:8443 (EWHATEVER).']
  ])('%s → %s', (code, kind, message) => {
    const error = classifySendError(wrapped(code), url)
    expect(error.code).toBe(kind)
    expect(error.message).toContain(message)
  })

  it('finds codes inside aggregated connection errors', () => {
    const aggregate = Object.assign(new TypeError('fetch failed'), { cause: new AggregateError([Object.assign(new Error('x'), { code: 'ECONNREFUSED' })]) })
    expect(classifySendError(aggregate, url).code).toBe('REFUSED')
  })

  it('reports a real refused connection and a real timeout against loopback', async () => {
    const closed = createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise(resolve => closed.close(resolve))
    const request = { method: 'GET' as const, url: `http://127.0.0.1:${port}/`, headers: [], unresolved: [], missingPathParams: [] }
    await expect(sendHttp(request, { timeoutMs: 2000, maxResponseBytes: 100 })).rejects.toMatchObject({ code: 'REFUSED' })
    const hang = createServer(() => undefined)
    await new Promise<void>(resolve => hang.listen(0, '127.0.0.1', resolve))
    try {
      await expect(sendHttp({ ...request, url: `http://127.0.0.1:${(hang.address() as AddressInfo).port}/` }, { timeoutMs: 150, maxResponseBytes: 100 }))
        .rejects.toMatchObject({ code: 'TIMEOUT', message: 'No response within 0.15 seconds.' })
    } finally {
      hang.closeAllConnections()
      hang.close()
    }
  })
})
