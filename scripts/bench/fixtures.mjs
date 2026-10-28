import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Deterministic benchmark fixtures. Every generator takes a fixed seed and
 * returns the same bytes on every run and machine, so the SHA-256 recorded in
 * fixtures.sha256.json identifies exactly what a benchmark measured.
 *
 *   node scripts/bench/fixtures.mjs           write fixtures to .bench/fixtures
 *   node scripts/bench/fixtures.mjs --record  also rewrite the hash manifest
 *   node scripts/bench/fixtures.mjs --check   fail if any hash differs from the manifest
 */

export const SEED = 20261028
/** Fixed loopback port shared by the fixtures and server.mjs; part of the hashed bytes. */
export const BENCH_PORT = 47811
export const BENCH_ORIGIN = `http://127.0.0.1:${BENCH_PORT}`
export const LARGE_JSON_BYTES = 20 * 1024 * 1024

const here = dirname(fileURLToPath(import.meta.url))
export const MANIFEST = join(here, 'fixtures.sha256.json')
export const DEFAULT_OUT = resolve(here, '../../.bench/fixtures')

/** mulberry32: small, fast and identical everywhere. */
export function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = ['account', 'order', 'invoice', 'plant', 'garden', 'shipment', 'ticket', 'user', 'report', 'device',
  'payment', 'catalog', 'review', 'session', 'webhook', 'region', 'policy', 'export', 'metric', 'channel']

function pick(next, list) {
  return list[Math.floor(next() * list.length)]
}

function words(next, count) {
  return Array.from({ length: count }, () => pick(next, WORDS)).join(' ')
}

/**
 * OpenAPI 3.0.3 document with exactly 1,000 operations: 249 resource paths
 * with GET/POST/PUT/DELETE, plus 4 bench routes served by server.mjs.
 */
export function generateOpenApi(seed = SEED) {
  const next = random(seed)
  const tags = Array.from({ length: 20 }, (_, index) => ({ name: `${WORDS[index]}s`, description: `Operations on ${WORDS[index]}s` }))
  const schemas = {}
  for (let index = 0; index < 40; index++) {
    const properties = { id: { type: 'string', format: 'uuid' } }
    const fields = 4 + Math.floor(next() * 8)
    for (let field = 0; field < fields; field++) {
      const kind = pick(next, ['string', 'integer', 'boolean', 'number'])
      properties[`${pick(next, WORDS)}_${field}`] = { type: kind, description: words(next, 4) }
    }
    schemas[`Model${index}`] = { type: 'object', required: ['id'], properties }
  }
  const paths = {}
  for (let index = 0; index < 249; index++) {
    const tag = tags[index % tags.length].name
    const model = `#/components/schemas/Model${index % 40}`
    const base = `/${tag}/r${index}`
    const ref = { $ref: model }
    const json = schema => ({ 'application/json': { schema } })
    const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
    paths[`${base}/{id}`] = {
      get: { tags: [tag], operationId: `get_${index}`, summary: `Get ${words(next, 2)}`, description: words(next, 12), parameters: [idParam,
        { name: 'expand', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'OK', content: json(ref) }, 404: { description: 'Not found' } } },
      put: { tags: [tag], operationId: `put_${index}`, summary: `Update ${words(next, 2)}`, parameters: [idParam],
        requestBody: { required: true, content: json(ref) }, responses: { 200: { description: 'OK', content: json(ref) } } },
      delete: { tags: [tag], operationId: `delete_${index}`, summary: `Delete ${words(next, 2)}`, parameters: [idParam], responses: { 204: { description: 'Deleted' } } }
    }
    paths[base] = {
      post: { tags: [tag], operationId: `create_${index}`, summary: `Create ${words(next, 2)}`,
        parameters: [{ name: 'X-Request-Id', in: 'header', schema: { type: 'string' } }],
        requestBody: { required: true, content: json(ref) }, responses: { 201: { description: 'Created', content: json(ref) } } }
    }
  }
  paths['/bench/large-json'] = { get: { tags: ['bench'], operationId: 'bench_large', summary: 'Large JSON response', responses: { 200: { description: '20 MiB JSON' } } } }
  paths['/bench/small-json'] = { get: { tags: ['bench'], operationId: 'bench_small', summary: 'Small JSON response', responses: { 200: { description: 'Small JSON' } } } }
  paths['/bench/status'] = { get: { tags: ['bench'], operationId: 'bench_status', summary: 'Status', responses: { 200: { description: 'OK' } } } }
  paths['/bench/echo'] = { post: { tags: ['bench'], operationId: 'bench_echo', summary: 'Echo', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: { description: 'Echo' } } } }
  const document = {
    openapi: '3.0.3',
    info: { title: 'Reqora Bench 1000', version: '1.0.0', description: 'Deterministic benchmark fixture' },
    servers: [{ url: BENCH_ORIGIN }],
    tags: [...tags, { name: 'bench', description: 'Routes served by the benchmark server' }],
    paths,
    components: { schemas }
  }
  return JSON.stringify(document, null, 2) + '\n'
}

/** A JSON array of records, at least `bytes` long. */
export function generateLargeJson(seed = SEED, bytes = LARGE_JSON_BYTES) {
  const next = random(seed)
  const parts = ['[']
  let length = 1
  for (let index = 0; length < bytes - 2; index++) {
    const record = JSON.stringify({
      id: index,
      name: words(next, 3),
      active: next() < 0.5,
      score: Math.round(next() * 1e6) / 100,
      tags: [pick(next, WORDS), pick(next, WORDS)],
      note: words(next, 10)
    })
    const piece = (index ? ',\n' : '\n') + record
    parts.push(piece)
    length += piece.length
  }
  parts.push('\n]\n')
  return parts.join('')
}

function keyValues(next, prefix, count) {
  return Array.from({ length: count }, (_, index) => ({ key: `${prefix}${index}`, value: words(next, 1), enabled: true }))
}

/** Workspace v2 with `projects` projects of `endpoints` endpoints each, pointing at the bench server. */
export function generateWorkspace(seed = SEED, projects = 10, endpoints = 100) {
  const next = random(seed)
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  const list = []
  for (let p = 0; p < projects; p++) {
    const folders = Array.from({ length: 10 }, (_, f) => ({ id: `fld_b${p}_${f}`, name: `${WORDS[(p + f) % WORDS.length]}s` }))
    const items = Array.from({ length: endpoints }, (_, e) => {
      const method = methods[e % methods.length]
      return {
        id: `ept_b${p}_${e}`,
        folderId: folders[e % folders.length].id,
        name: `${method === 'GET' ? 'Get' : 'Change'} ${words(next, 2)} ${e}`,
        method,
        path: e === 0 ? '/bench/large-json' : `/${folders[e % folders.length].name}/r${e}/{id}`,
        description: words(next, 12),
        tags: [folders[e % folders.length].name],
        query: keyValues(next, 'q', 2),
        headers: keyValues(next, 'X-H', 1),
        pathParams: e === 0 ? [] : [{ key: 'id', value: String(e), enabled: true }],
        cookies: [],
        body: method === 'GET' || method === 'DELETE' ? { mode: 'none' } : { mode: 'json', raw: JSON.stringify({ name: words(next, 2) }, null, 2) },
        responses: [{ status: '200', description: 'OK', contentType: 'application/json', example: JSON.stringify({ id: e, name: words(next, 2) }, null, 2) }]
      }
    })
    list.push({
      id: `prj_b${p}`,
      name: `Bench project ${p + 1}`,
      description: words(next, 8),
      folders,
      endpoints: items,
      resources: [],
      importSources: [],
      environments: [{ id: `env_b${p}`, name: 'Bench', baseUrl: BENCH_ORIGIN, variables: [{ id: `var_b${p}`, key: 'token', value: 'bench', secret: false, enabled: true }] }],
      activeEnvironmentId: `env_b${p}`,
      globals: []
    })
  }
  return JSON.stringify({ version: 2, revision: 0, activeProjectId: list[0].id, projects: list }, null, 2) + '\n'
}

export const FIXTURES = {
  'openapi-1000.json': () => generateOpenApi(),
  'large-20mib.json': () => generateLargeJson(),
  'workspace-10x100.json': () => generateWorkspace()
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

/** Writes every fixture to `out` and returns { name: { sha256, bytes } }. */
export async function writeFixtures(out = DEFAULT_OUT) {
  await mkdir(out, { recursive: true })
  const hashes = {}
  for (const [name, generate] of Object.entries(FIXTURES)) {
    const text = generate()
    await writeFile(join(out, name), text)
    hashes[name] = { sha256: sha256(text), bytes: Buffer.byteLength(text) }
  }
  return hashes
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const hashes = await writeFixtures()
  if (args.includes('--record')) await writeFile(MANIFEST, JSON.stringify({ seed: SEED, fixtures: hashes }, null, 2) + '\n')
  if (args.includes('--check')) {
    const expected = JSON.parse(await readFile(MANIFEST, 'utf8')).fixtures
    const mismatched = Object.keys({ ...expected, ...hashes }).filter(name => expected[name]?.sha256 !== hashes[name]?.sha256)
    if (mismatched.length) {
      console.error(`Fixture hashes differ from ${MANIFEST}: ${mismatched.join(', ')}`)
      process.exit(1)
    }
  }
  console.log(JSON.stringify(hashes, null, 2))
}
