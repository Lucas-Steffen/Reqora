// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { importDocument } from '../../src/importer/pipeline'
import { isWorkspace, normalizeWorkspace } from '../../src/workspace/repository'
import { generateLargeJson, generateOpenApi, generateWorkspace, random, sha256 } from './fixtures.mjs'
import { startBenchServer } from './server.mjs'
import { median, parseSamples, totalsByTick } from './sampler.mjs'

describe('bench fixtures', () => {
  it('generates the same bytes for the same seed', () => {
    expect(sha256(generateOpenApi())).toBe(sha256(generateOpenApi()))
    expect(sha256(generateWorkspace())).toBe(sha256(generateWorkspace()))
    expect(generateOpenApi(1)).not.toBe(generateOpenApi(2))
    const next = random(7)
    expect([next(), next()]).toEqual((() => { const again = random(7); return [again(), again()] })())
  })

  it('imports the OpenAPI fixture as exactly 1,000 operations', async () => {
    const spec = await importDocument(generateOpenApi(), 'file:///bench/openapi-1000.json', async () => { throw new Error('no refs expected') })
    expect(spec.operations).toHaveLength(1000)
    expect(new Set(spec.operations.map(operation => `${operation.method} ${operation.path}`)).size).toBe(1000)
  })

  it('produces a valid v2 workspace with unique ids', () => {
    const workspace = JSON.parse(generateWorkspace())
    expect(isWorkspace(workspace)).toBe(true)
    const normalized = normalizeWorkspace(workspace)
    expect(normalized.projects).toHaveLength(10)
    const ids = normalized.projects.flatMap(project => [project.id, ...project.folders.map(folder => folder.id), ...project.endpoints.map(endpoint => endpoint.id)])
    expect(new Set(ids).size).toBe(ids.length)
    expect(normalized.projects.every(project => project.endpoints.length === 100)).toBe(true)
  })

  it('generates parseable large JSON of at least the requested size', () => {
    const text = generateLargeJson(3, 64 * 1024)
    expect(text.length).toBeGreaterThanOrEqual(64 * 1024)
    expect(Array.isArray(JSON.parse(text))).toBe(true)
    expect(generateLargeJson(3, 64 * 1024)).toBe(text)
  })
})

describe('bench server', () => {
  it('serves the bench routes on loopback', async () => {
    const server = await startBenchServer({ port: 0, fixturesDir: '/nonexistent' })
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
      expect(await (await fetch(`${server.url}/bench/status`)).json()).toEqual({ ok: true })
      const echo = await fetch(`${server.url}/bench/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' })
      expect(await echo.text()).toBe('{"a":1}')
      expect((await fetch(`${server.url}/fixtures/..%2Fsecret`)).status).toBe(404)
      expect(server.hits.get('/bench/status')).toBe(1)
    } finally {
      await server.close()
    }
  })
})

describe('sampler parsing', () => {
  it('sums each tick across the tree', () => {
    const rows = parseSamples('t,pid,ppid,name,ws,priv,wsPriv,cpuMs\n100,1,0,a.exe,10,20,5,1\n100,2,1,b.exe,30,40,15,2\n200,1,0,a.exe,11,21,6,3\n')
    expect(totalsByTick(rows)).toEqual([
      { t: 100, processes: 2, ws: 40, priv: 60, wsPriv: 20, cpuMs: 3 },
      { t: 200, processes: 1, ws: 11, priv: 21, wsPriv: 6, cpuMs: 3 }
    ])
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
  })
})
