import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BENCH_PORT, DEFAULT_OUT, generateLargeJson } from './fixtures.mjs'

/**
 * Loopback server for the benchmark scenarios. It binds 127.0.0.1 only.
 *
 *   GET  /bench/large-json      the 20 MiB fixture (read from fixturesDir, or generated)
 *   GET  /bench/small-json      a small JSON object
 *   GET  /bench/status          {"ok":true}
 *   POST /bench/echo            echoes the request body
 *   GET  /fixtures/<name>       any file from fixturesDir (used by the URL import scenario)
 *   anything else               a small JSON 200, so every imported endpoint can be sent
 *
 *   node scripts/bench/server.mjs [port]
 */
export async function startBenchServer({ port = BENCH_PORT, fixturesDir = DEFAULT_OUT } = {}) {
  const hits = new Map()
  let large
  const loadLarge = async () => {
    large ??= await readFile(join(fixturesDir, 'large-20mib.json')).catch(() => Buffer.from(generateLargeJson()))
    return large
  }
  const send = (response, status, body, type = 'application/json') => {
    response.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) })
    response.end(body)
  }

  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    hits.set(path, (hits.get(path) ?? 0) + 1)
    try {
      if (path === '/bench/large-json') return send(response, 200, await loadLarge())
      if (path === '/bench/small-json') return send(response, 200, JSON.stringify({ id: 1, name: 'small', ok: true }))
      if (path === '/bench/status') return send(response, 200, JSON.stringify({ ok: true }))
      if (path === '/bench/echo') {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        return send(response, 200, Buffer.concat(chunks), request.headers['content-type'] ?? 'application/octet-stream')
      }
      if (path.startsWith('/fixtures/')) {
        const name = path.slice('/fixtures/'.length)
        if (!/^[\w.-]+$/.test(name)) return send(response, 404, '{"error":"not found"}')
        return send(response, 200, await readFile(join(fixturesDir, name)))
      }
      return send(response, 200, JSON.stringify({ path, method: request.method }))
    } catch {
      send(response, 404, '{"error":"not found"}')
    }
  })

  await new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', done)
  })
  const url = `http://127.0.0.1:${server.address().port}`
  return {
    url,
    hits,
    close: () => new Promise(done => {
      server.closeAllConnections()
      server.close(() => done())
    })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? BENCH_PORT)
  const { url } = await startBenchServer({ port })
  console.log(`Bench server on ${url}`)
}
