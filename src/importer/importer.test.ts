// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { searchRecords, DEFAULT_SEARCH_OPTIONS } from '../search'
import { createDemoProject } from '../workspace/demo'
import { toSearchRecords } from '../workspace/records'
import type { Project } from '../workspace/types'
import { commonYaml, oas3Yaml, swagger2Json } from './fixtures'
import { ImportError } from './errors'
import { detectSpec, parseDocument } from './parse'
import { importDocument, planImport, sourceIdFor, type ImportedSpec } from './pipeline'
import { readPointer } from './refs'

const ROOT = 'file:///specs/garden.yaml'
const loader = async (uri: string) => {
  if (uri === 'file:///specs/common.yaml') return commonYaml
  throw new ImportError('FILE', 'missing')
}
const NOW = '2026-10-16T00:00:00.000Z'
const fileOrigin = { kind: 'file' as const, location: 'garden.yaml' }

async function garden(): Promise<ImportedSpec> {
  return importDocument(oas3Yaml, ROOT, loader)
}

describe('parsing and detection', () => {
  it('parses JSON and YAML, and detects OpenAPI 3.x and Swagger 2.0', () => {
    expect(detectSpec(parseDocument(oas3Yaml))).toEqual({ kind: 'openapi3', version: '3.0.3' })
    expect(detectSpec(parseDocument(swagger2Json))).toEqual({ kind: 'swagger2', version: '2.0' })
    expect(detectSpec(parseDocument('{"openapi":"3.1.0","info":{},"paths":{}}')).version).toBe('3.1.0')
    expect(detectSpec(parseDocument('﻿swagger: "2.0"\npaths: {}')).kind).toBe('swagger2')
  })

  it.each([
    ['', 'EMPTY'],
    ['{"openapi": ', 'PARSE'],
    ['a: [unclosed', 'PARSE'],
    ['- 1\n- 2', 'NOT_OPENAPI'],
    ['{"info":{}}', 'NOT_OPENAPI'],
    ['{"swagger":"1.2"}', 'UNSUPPORTED_VERSION'],
    ['{"openapi":"4.0.0"}', 'UNSUPPORTED_VERSION']
  ])('rejects %j with %s', (text, code) => {
    let caught: unknown
    try { detectSpec(parseDocument(text)) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(ImportError)
    expect((caught as ImportError).code).toBe(code)
  })

  it('caps YAML alias expansion', () => {
    const bomb = ['a: &a [x, x, x, x, x, x, x, x, x]', ...Array.from({ length: 8 }, (_, i) =>
      `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [${Array(9).fill('*' + String.fromCharCode(97 + i)).join(', ')}]`)].join('\n')
    expect(() => parseDocument(bomb)).toThrow(ImportError)
  })

  it('reads escaped and percent-encoded JSON pointers', () => {
    const doc = { 'a/b': { 'c~d': 1 }, 'sp ace': 2 }
    expect(readPointer(doc, '/a~1b/c~0d')).toBe(1)
    expect(readPointer(doc, '/sp%20ace')).toBe(2)
    expect(readPointer(doc, '/missing')).toBeUndefined()
  })
})

describe('OpenAPI 3 conversion', () => {
  it('normalizes metadata, servers, operations and schemas', async () => {
    const spec = await garden()
    expect(spec).toMatchObject({ kind: 'openapi3', title: 'Garden Supply API', version: '1.4.0', servers: ['https://eu.garden.test/v1'] })
    expect(spec.operations.map(operation => `${operation.method} ${operation.path}`)).toEqual([
      'GET /plants', 'POST /plants', 'GET /plants/{plantId}', 'POST /store/orders', 'GET /health'
    ])
    expect(spec.schemas.map(schema => schema.name)).toEqual(['Plant', 'Node', 'a/b'])
    expect(spec.securitySchemes.apiKeyAuth).toEqual({ type: 'apiKey', in: 'header', name: 'X-Api-Key' })
    expect(spec.security).toEqual([['apiKeyAuth']])
  })

  it('resolves internal, escaped, external and parameter references', async () => {
    const spec = await garden()
    const [list, create, get] = spec.operations
    expect(list.parameters).toEqual([{ name: 'limit', in: 'query', required: false, description: 'integer', example: '20' }])
    expect(JSON.parse(list.responses[0].example!)).toEqual([{ name: 'Monstera', tree: { label: 'string', children: [null] } }])
    expect(JSON.parse(create.responses[1].example!)).toEqual({ code: 'NOT_FOUND', message: 'string' })
    expect(JSON.parse(get.responses[0].example!)).toEqual({ escaped: true })
    expect(create.body).toMatchObject({ mode: 'json', contentType: 'application/json' })
    expect(JSON.parse(create.body.raw!)).toEqual({ name: 'Fern', tree: { label: 'root', children: [] } })
  })

  it('keeps recursive references as references with a warning', async () => {
    const spec = await garden()
    const node = JSON.parse(spec.schemas[1].content)
    expect(node.properties.children.items).toEqual({ $ref: '#/components/schemas/Node', 'x-circular': true })
    expect(spec.warnings.some(warning => warning.includes('Recursive reference'))).toBe(true)
  })

  it('merges path-level parameters, with operation parameters overriding', async () => {
    const get = (await garden()).operations[2]
    expect(get.parameters).toEqual([
      { name: 'plantId', in: 'path', required: true, description: 'The plant identifier', example: 'pl_1' },
      { name: 'X-Trace', in: 'header', required: false, description: 'string', example: undefined }
    ])
    expect(get.security).toEqual([])
  })

  it('converts form bodies and preserves deprecation', async () => {
    const order = (await garden()).operations[3]
    expect(order.deprecated).toBe(true)
    expect(order.body).toEqual({
      mode: 'form-urlencoded', contentType: 'application/x-www-form-urlencoded',
      form: [{ key: 'plantId', value: '', enabled: true, description: 'Plant to buy' }, { key: 'quantity', value: '', enabled: true, description: undefined }]
    })
  })

  it('reports unresolved external references as warnings instead of failing', async () => {
    const spec = await importDocument(oas3Yaml, ROOT, async () => { throw new ImportError('FILE', 'references outside the imported file\'s folder are not allowed') })
    expect(spec.warnings).toContain('External reference common.yaml was not resolved: references outside the imported file\'s folder are not allowed')
    expect(spec.operations[1].responses[1].example).toBe('null')
  })

  it('limits the number of external documents', async () => {
    const doc = JSON.stringify({ openapi: '3.0.0', info: { title: 't' }, paths: {}, components: { schemas: { a: { $ref: 'a.json' }, b: { $ref: 'b.json' } } } })
    await expect(importDocument(doc, ROOT, async () => '{}', { maxDocuments: 2, maxNodes: 1000 })).rejects.toMatchObject({ code: 'LIMIT' })
  })
})

describe('Swagger 2.0 conversion', () => {
  it('builds the server from host/basePath and converts body, form and examples', async () => {
    const spec = await importDocument(swagger2Json, 'https://library.test/swagger.json', loader)
    expect(spec.servers).toEqual(['http://library.test/api'])
    const [search, add, cover] = spec.operations
    expect(search.parameters[0]).toEqual({ name: 'q', in: 'query', required: false, description: 'string', example: 'dune' })
    expect(JSON.parse(search.responses[0].example!)).toEqual([{ id: 'string', title: 'Dune' }])
    expect(search.security).toEqual([['token']])
    expect(add.body.mode).toBe('json')
    expect(JSON.parse(add.body.raw!)).toEqual({ id: 'string', title: 'Dune' })
    expect(JSON.parse(add.responses[0].example!)).toEqual({ id: 'b1' })
    expect(cover.body).toMatchObject({ mode: 'form-data', form: [{ key: 'image', value: '' }] })
    expect(spec.securitySchemes).toEqual({ basic: { type: 'basic' }, token: { type: 'apiKey', in: 'query', name: 'token' } })
  })
})

describe('import planning', () => {
  const emptyProject = (): Project => ({ id: 'p', name: 'Garden', folders: [], endpoints: [], resources: [], importSources: [], environments: [], activeEnvironmentId: null, globals: [] })

  it('maps first tags to nested folders and untagged operations to the root', async () => {
    const plan = planImport(emptyProject(), await garden(), fileOrigin, { grouping: 'tags', mode: 'merge', now: NOW })
    const names = plan.project.folders.map(folder => folder.name)
    expect(names).toEqual(['Plants', 'Store', 'Orders', 'Schemas'])
    const orders = plan.project.folders.find(folder => folder.name === 'Orders')!
    expect(plan.project.folders.find(folder => folder.id === orders.parentId)?.name).toBe('Store')
    expect(orders.description).toBe('Orders placed in the shop.')
    const health = plan.project.endpoints.find(endpoint => endpoint.path === '/health')!
    expect(health.folderId).toBeUndefined()
    expect(health.name).toBe('health')
    expect(plan.project.endpoints.find(endpoint => endpoint.path === '/store/orders')).toMatchObject({ status: 'Deprecated', tags: ['Store/Orders', 'Plants'] })
    expect(plan.counts).toMatchObject({ endpoints: 5, folders: 4, schemas: 3, added: 5 })
    expect(plan.isReimport).toBe(false)
    expect(plan.rows.find(row => row.path === '/store/orders')?.folder).toBe('Store / Orders')
  })

  it('groups by first path segment when requested', async () => {
    const plan = planImport(emptyProject(), await garden(), fileOrigin, { grouping: 'paths', mode: 'merge', now: NOW })
    expect(plan.project.folders.filter(folder => folder.name !== 'Schemas').map(folder => folder.name)).toEqual(['plants', 'store', 'health'])
  })

  it('applies document-level security when an operation has none, and keeps explicit empty security', async () => {
    const { project } = planImport(emptyProject(), await garden(), fileOrigin, { grouping: 'tags', mode: 'merge', now: NOW })
    expect(project.endpoints.find(endpoint => endpoint.path === '/plants')?.security).toEqual([['apiKeyAuth']])
    expect(project.endpoints.find(endpoint => endpoint.path === '/plants/{plantId}')?.security).toEqual([])
    expect(project.importedSecuritySchemes?.[sourceIdFor(fileOrigin)]).toHaveProperty('apiKeyAuth')
  })

  it('makes imported endpoints searchable through the pure search module', async () => {
    const base = createDemoProject()
    const { project } = planImport(base, await garden(), fileOrigin, { grouping: 'tags', mode: 'merge', now: NOW })
    const records = toSearchRecords(project)
    const hits = searchRecords(records, '/plants/pl_1', DEFAULT_SEARCH_OPTIONS)
    expect(hits.map(hit => hit.record.name)).toEqual(['Get plant'])
    expect(hits[0].record.breadcrumbs).toEqual(['Commerce API', 'Plants'])
    expect(searchRecords(records, 'Orders', { ...DEFAULT_SEARCH_OPTIONS, fields: ['folder'], kinds: ['api'] }).map(hit => hit.record.name))
      .toEqual(expect.arrayContaining(['Place order', 'List orders']))
  })

  it('re-import merge updates in place, keeps user fields and retains removed endpoints', async () => {
    const first = planImport(emptyProject(), await garden(), fileOrigin, { grouping: 'tags', mode: 'merge', now: NOW }).project
    const edited: Project = {
      ...first,
      endpoints: [
        ...first.endpoints.map(endpoint => endpoint.path === '/plants' && endpoint.method === 'GET' ? { ...endpoint, maintainer: 'Rae' } : endpoint),
        { id: 'manual', name: 'Manual', method: 'GET', path: '/manual', tags: [], query: [], headers: [], pathParams: [], cookies: [], body: { mode: 'none' }, responses: [], folderId: first.folders[0].id }
      ]
    }
    const changed = await importDocument(oas3Yaml.replace('summary: List plants', 'summary: List all plants').replace(/\n  \/health:\n    get:\n      operationId: health\n      responses:\n        '204': \{ description: No content \}/, ''), ROOT, loader)
    const plan = planImport(edited, changed, fileOrigin, { grouping: 'tags', mode: 'merge', now: NOW })
    expect(plan.isReimport).toBe(true)
    expect(plan.counts).toMatchObject({ added: 0, updated: 1, unchanged: 3, retained: 1, removed: 0 })
    const list = plan.project.endpoints.find(endpoint => endpoint.path === '/plants' && endpoint.method === 'GET')!
    expect(list).toMatchObject({ name: 'List all plants', maintainer: 'Rae', id: first.endpoints[0].id })
    expect(plan.project.endpoints.some(endpoint => endpoint.path === '/health')).toBe(true)
    expect(plan.project.endpoints.some(endpoint => endpoint.id === 'manual')).toBe(true)
    expect(plan.project.importSources).toHaveLength(1)
  })

  it('re-import overwrite replaces matched endpoints, deletes unmatched only when asked, and isolates other items', async () => {
    const first = planImport(emptyProject(), await garden(), fileOrigin, { grouping: 'tags', mode: 'merge', now: NOW }).project
    const withOther = planImport(first, await importDocument(swagger2Json, 'https://library.test/swagger.json', loader),
      { kind: 'url', location: 'https://library.test/swagger.json' }, { grouping: 'tags', mode: 'merge', now: NOW }).project
    const manual = { id: 'manual', name: 'Manual', method: 'GET' as const, path: '/m', tags: [], query: [], headers: [], pathParams: [], cookies: [], body: { mode: 'none' as const }, responses: [], folderId: first.folders[0].id }
    const edited: Project = {
      ...withOther,
      endpoints: withOther.endpoints.map(endpoint => endpoint.path === '/plants' && endpoint.method === 'GET' ? { ...endpoint, maintainer: 'Rae' } : endpoint).concat(manual)
    }
    const trimmed = await importDocument(oas3Yaml.replace(/\n  \/store\/orders:[\s\S]*?'200': \{ description: OK \}/, ''), ROOT, loader)
    expect(planImport(edited, trimmed, fileOrigin, { grouping: 'tags', mode: 'overwrite', now: NOW }).counts).toMatchObject({ removed: 0, retained: 1 })
    const plan = planImport(edited, trimmed, fileOrigin, { grouping: 'tags', mode: 'overwrite', deleteUnmatched: true, now: NOW })
    expect(plan.counts.removed).toBe(1)
    const paths = plan.project.endpoints.map(endpoint => endpoint.path)
    expect(paths).not.toContain('/store/orders')
    expect(paths).toEqual(expect.arrayContaining(['/books', '/m']))
    expect(plan.project.endpoints.find(endpoint => endpoint.path === '/plants' && endpoint.method === 'GET')?.maintainer).toBeUndefined()
    // The Plants folder still holds the manual endpoint; Store/Orders is gone.
    expect(plan.project.folders.map(folder => folder.name)).toEqual(['Books', 'Schemas', 'Plants', 'Schemas'])
    expect(plan.project.importSources).toHaveLength(2)
  })

  it('produces deterministic IDs and identical plans for identical input', async () => {
    const a = planImport(emptyProject(), await garden(), fileOrigin, { grouping: 'tags', mode: 'merge', now: NOW })
    const b = planImport(emptyProject(), await garden(), fileOrigin, { grouping: 'tags', mode: 'merge', now: NOW })
    expect(a).toEqual(b)
    const again = planImport(a.project, await garden(), fileOrigin, { grouping: 'tags', mode: 'overwrite', now: NOW })
    expect(again.counts).toMatchObject({ added: 0, updated: 0, unchanged: 5, removed: 0 })
  })
})
