// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commonYaml, oas3Yaml } from '../importer/fixtures'
import { createDemoWorkspace } from '../workspace/demo'
import { StaleRevisionError } from '../workspace/repository'
import { fetchText } from './http/boundedFetch'
import { createImportService } from './importService'
import { createFileWorkspaceStore } from './workspaceStore'

let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost')
    switch (url.pathname) {
      case '/spec.yaml': response.setHeader('content-type', 'application/yaml'); response.end(oas3Yaml); break
      case '/common.yaml': response.end(commonYaml); break
      case '/local-ref.json': response.end(JSON.stringify({ openapi: '3.0.0', info: { title: 'x' }, paths: {}, components: { schemas: { A: { $ref: 'file:///etc/passwd' } } } }))
        break
      case '/redirect': response.writeHead(302, { location: '/spec.yaml' }); response.end(); break
      case '/loop': response.writeHead(301, { location: '/loop' }); response.end(); break
      case '/to-file': response.writeHead(302, { location: 'file:///c:/secret.yaml' }); response.end(); break
      case '/slow': response.writeHead(200); response.write('openapi: 3.0.0\n'); break // never ends
      case '/big-declared': response.writeHead(200, { 'content-length': String(100) }); response.end('x'.repeat(100)); break
      case '/big-chunked': response.writeHead(200); for (let i = 0; i < 20; i++) response.write('y'.repeat(10)); response.end(); break
      case '/missing': response.writeHead(404, 'Not Found'); response.end(); break
      default: response.writeHead(500); response.end()
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.closeAllConnections(); server.close() })

const limits = { timeoutMs: 400, maxBytes: 64, maxRedirects: 2 }

describe('bounded document fetch (loopback only)', () => {
  it('follows a bounded number of redirects and reports the final URL', async () => {
    const result = await fetchText(`${base}/redirect`, { ...limits, maxBytes: 1 << 20 })
    expect(result.finalUrl).toBe(`${base}/spec.yaml`)
    expect(result.text).toContain('Garden Supply API')
    await expect(fetchText(`${base}/loop`, limits)).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS', message: 'Stopped after 2 redirects from ' + base + '/loop.' })
    await expect(fetchText(`${base}/to-file`, limits)).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEME' })
  })

  it('enforces a total timeout including the body', async () => {
    await expect(fetchText(`${base}/slow`, limits)).rejects.toMatchObject({ code: 'TIMEOUT', message: 'The server did not finish responding within 0.4 seconds.' })
  })

  it('enforces the size limit from content-length and while streaming', async () => {
    await expect(fetchText(`${base}/big-declared`, limits)).rejects.toMatchObject({ code: 'TOO_LARGE' })
    await expect(fetchText(`${base}/big-chunked`, limits)).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('gives clear errors for status codes, bad URLs, schemes and unreachable hosts', async () => {
    await expect(fetchText(`${base}/missing`, limits)).rejects.toMatchObject({ code: 'HTTP_STATUS', message: `The server responded with HTTP 404 Not Found for ${base}/missing.` })
    await expect(fetchText('not a url', limits)).rejects.toMatchObject({ code: 'INVALID_URL' })
    await expect(fetchText('ftp://example.test/a', limits)).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEME' })
    const closed = createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise(resolve => closed.close(resolve))
    await expect(fetchText(`http://127.0.0.1:${port}/`, limits)).rejects.toMatchObject({ code: 'NETWORK', message: `Could not reach 127.0.0.1:${port}: the connection was refused.` })
  })

  it('never echoes URL credentials or query strings in errors', async () => {
    const error = await fetchText(`http://user:hunter2@127.0.0.1:${new URL(base).port}/missing?token=abc`, limits).catch(reason => reason)
    expect(error.message).not.toContain('hunter2')
    expect(error.message).not.toContain('abc')
  })
})

describe('import service', () => {
  let directory = ''
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'reqora-import-'))
    await mkdir(join(directory, 'api'))
    await writeFile(join(directory, 'api', 'garden.yaml'), oas3Yaml)
    await writeFile(join(directory, 'api', 'common.yaml'), commonYaml)
    await writeFile(join(directory, 'api', 'escape.yaml'), oas3Yaml.replace('./common.yaml', '../outside.yaml'))
    await writeFile(join(directory, 'outside.yaml'), commonYaml)
    await writeFile(join(directory, 'api', 'notes.txt'), 'hello')
  })
  afterAll(() => rm(directory, { recursive: true, force: true }))

  const service = () => createImportService({ fetchOptions: { timeoutMs: 2000 } })

  it('imports a local file and resolves sibling references', async () => {
    const outcome = await service().fromPath(join(directory, 'api', 'garden.yaml'))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.origin).toEqual({ kind: 'file', location: 'garden.yaml' })
    expect(outcome.spec.warnings.filter(warning => warning.includes('External'))).toEqual([])
  })

  it('refuses references that escape the selected file\'s folder', async () => {
    const outcome = await service().fromPath(join(directory, 'api', 'escape.yaml'))
    expect(outcome.ok && outcome.spec.warnings).toContain('External reference outside.yaml was not resolved: references outside the imported file\'s folder are not allowed')
  })

  it('rejects unsupported extensions and missing files', async () => {
    expect(await service().fromPath(join(directory, 'api', 'notes.txt'))).toMatchObject({ ok: false, error: { code: 'FILE' } })
    expect(await service().fromPath(join(directory, 'api', 'none.yaml'))).toMatchObject({ ok: false, error: { code: 'FILE', message: 'The file none.yaml could not be found or opened.' } })
  })

  it('imports from a URL, resolving relative HTTP references', async () => {
    const outcome = await service().fromUrl(`${base}/redirect`)
    expect(outcome).toMatchObject({ ok: true, origin: { kind: 'url', location: `${base}/redirect` } })
    expect(outcome.ok && outcome.spec.warnings.filter(warning => warning.includes('External'))).toEqual([])
  })

  it('does not let URL documents reference local files', async () => {
    const outcome = await service().fromUrl(`${base}/local-ref.json`)
    expect(outcome.ok && outcome.spec.warnings[0]).toBe('External reference passwd was not resolved: documents loaded from a URL cannot reference local files')
  })

  it('returns structured failures for URL errors', async () => {
    expect(await service().fromUrl(`${base}/missing`)).toMatchObject({ ok: false, error: { code: 'HTTP_STATUS' } })
    expect(await service().fromUrl('file:///c:/x.yaml')).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_SCHEME' } })
  })
})

describe('file workspace store', () => {
  it('seeds the demo workspace, saves atomically with revisions, and reloads from disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reqora-store-'))
    try {
      const store = createFileWorkspaceStore(directory)
      const loaded = await store.load()
      expect(loaded.revision).toBe(0)
      const saved = await store.save({ ...loaded, projects: [{ ...loaded.projects[0], name: 'Renamed' }] })
      expect(saved.revision).toBe(1)
      await expect(store.save(loaded)).rejects.toBeInstanceOf(StaleRevisionError)
      await expect(store.save({ nope: true } as never)).rejects.toThrow('invalid')
      const reopened = await createFileWorkspaceStore(directory).load()
      expect(reopened.projects[0].name).toBe('Renamed')
      expect(JSON.parse(await readFile(join(directory, 'workspace.json'), 'utf8')).revision).toBe(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('falls back to the demo workspace when the file is corrupt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reqora-store-'))
    try {
      await writeFile(join(directory, 'workspace.json'), '{ broken')
      expect((await createFileWorkspaceStore(directory).load()).projects[0].id).toBe(createDemoWorkspace().projects[0].id)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
