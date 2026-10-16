import { _electron as electronTest } from 'playwright'
import electronPath from 'electron'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { searchScenario } from './smoke/search.mjs'
import { importRoutes, importScenario } from './smoke/import.mjs'
import { echoRoutes, environmentsScenario } from './smoke/environments.mjs'
import { sendingRoutes, sendingScenario } from './smoke/sending.mjs'
import { projectsScenario } from './smoke/projects.mjs'

/**
 * Launches the built Electron app with a hidden window and a throwaway
 * profile, then runs the requested scenarios (default: all). All network
 * traffic goes to a loopback server started here; nothing leaves the machine.
 */
const scenarios = { search: searchScenario, import: importScenario, environments: environmentsScenario, sending: sendingScenario, projects: projectsScenario }
const evidenceDirectories = { sending: 'docs/request-sending/evidence', projects: 'docs/projects/evidence' }
const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios)

const workDir = await mkdtemp(join(tmpdir(), 'reqora-smoke-'))
const profile = join(workDir, 'profile')
const env = { ...process.env, REQORA_SMOKE_TEST: '1' }
delete env.ELECTRON_RUN_AS_NODE

const echoHits = []
const sendingHits = []
const fixtures = resolve('src/importer/__fixtures__')
const routes = {
  ...importRoutes({ garden: await readFile(join(fixtures, 'garden.yaml'), 'utf8'), common: await readFile(join(fixtures, 'common.yaml'), 'utf8') }),
  '/hang': { hang: true },
  ...echoRoutes(echoHits),
  ...sendingRoutes(sendingHits)
}
const hits = []
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  hits.push(path)
  const route = routes[path]
  if (!route) { response.writeHead(404); response.end(); return }
  if (route.handler) {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => route.handler(request, body, response))
    return
  }
  if (route.hang) { response.writeHead(200); response.write('openapi: 3.0.0\n'); return }
  if (route.location) { response.writeHead(route.status ?? 302, { location: route.location }); response.end(); return }
  response.writeHead(route.status ?? 200, { 'content-type': route.type ?? 'application/json' })
  response.end(route.body)
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const serverInfo = { url: `http://127.0.0.1:${server.address().port}`, hits, echoHits, sendingHits, routes }

const failures = []
const results = {}
const instances = []

/** Launches the built app on a profile directory; renderer errors are collected. */
async function launch(profileDirectory) {
  const application = await electronTest.launch({
    executablePath: electronPath,
    args: ['.', `--user-data-dir=${profileDirectory}`],
    env,
    timeout: 30000
  })
  instances.push(application)
  const page = await application.firstWindow()
  page.on('pageerror', error => failures.push(error.message))
  async function capture(directory, name) {
    await mkdir(resolve(directory), { recursive: true })
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    const base64 = await application.evaluate(async ({ BrowserWindow }) => {
      const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      return image.toPNG().toString('base64')
    })
    await writeFile(join(resolve(directory), name), Buffer.from(base64, 'base64'))
  }
  return { application, page, capture, close: () => application.close() }
}

try {
  const { application, page, capture } = await launch(profile)
  for (const name of selected) {
    const checks = []
    const started = Date.now()
    await scenarios[name]({ application, page, capture, launch, check: label => checks.push(label), server: serverInfo, workDir })
    assert.deepEqual(failures, [], `Renderer page errors during ${name}`)
    checks.push('No renderer page errors observed during the scenario')
    results[name] = { outcome: 'passed', durationMs: Date.now() - started, checks }
    const evidence = resolve(evidenceDirectories[name] ?? `docs/apidog-${name}/evidence/reqora-runtime`)
    await mkdir(evidence, { recursive: true })
    await writeFile(join(evidence, 'smoke-result.json'), JSON.stringify({
      target: 'Reqora (not Apidog)', command: `pnpm build && pnpm smoke:electron ${name}`, outcome: 'passed', checks, rendererErrors: failures
    }, null, 2))
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  for (const instance of instances) await instance.close().catch(() => undefined)
  server.closeAllConnections()
  server.close()
  // Only remove the fresh, owned smoke-test directory after Electron exits.
  if (resolve(workDir).startsWith(resolve(tmpdir()) + '\\') || resolve(workDir).startsWith(resolve(tmpdir()) + '/')) {
    await rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
}
