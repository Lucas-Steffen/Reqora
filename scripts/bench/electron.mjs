import { _electron as electronTest } from 'playwright'
import electronPath from 'electron'
import { spawn, execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, freemem, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_OUT, writeFixtures } from './fixtures.mjs'
import { startBenchServer } from './server.mjs'
import { median, startSampler, totalsByTick } from './sampler.mjs'
import { at, window } from './stats.mjs'

/**
 * Electron baseline (TASK-003). Run `pnpm build` first, then:
 *
 *   node scripts/bench/electron.mjs [--runs 5] [--only startup,import,...] [--out dir]
 *
 * Every run gets a fresh profile seeded with workspace-10x100.json. Startup and
 * idle launch the executable directly, with no automation attached; the other
 * scenarios drive the window through Playwright. The sampler follows the whole
 * process tree from the Electron main process. Raw CSVs and summary.json go to
 * docs/migration/bench-results/electron/.
 */

const root = resolve(import.meta.dirname, '../..')
const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : fallback
}
const RUNS = Number(option('runs', 5))
const OUT = resolve(option('out', join(root, 'docs/migration/bench-results/electron')))
const SCENARIOS = ['startup-idle', 'import', 'search', 'open-10', 'large-response', 'project-switch', 'continuous']
const selected = option('only', SCENARIOS.join(',')).split(',')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.REQORA_SMOKE_TEST

const pause = ms => new Promise(done => setTimeout(done, ms))

async function freshProfile() {
  const profile = await mkdtemp(join(tmpdir(), 'reqora-bench-'))
  await copyFile(join(DEFAULT_OUT, 'workspace-10x100.json'), join(profile, 'workspace.json'))
  return profile
}

function killTree(pid) {
  try { execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
}

/** Least-squares slope of y over x. */
function slope(points) {
  const n = points.length
  const mx = points.reduce((sum, [x]) => sum + x, 0) / n
  const my = points.reduce((sum, [, y]) => sum + y, 0) / n
  const num = points.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0)
  const den = points.reduce((sum, [x]) => sum + (x - mx) ** 2, 0)
  return den ? num / den : 0
}

function machine() {
  return { freeMemBytes: freemem(), totalMemBytes: totalmem() }
}

/** Startup and idle: plain launch, memory at T+5 s and over the next 60 s. */
async function startupIdle(run) {
  const profile = await freshProfile()
  const csv = join(OUT, `startup-idle-run${run}.csv`)
  const before = machine()
  const spawnedAt = Date.now()
  const app = spawn(electronPath, ['.', `--user-data-dir=${profile}`], { cwd: root, env, stdio: 'ignore' })
  try {
    const sampler = await startSampler(app.pid, csv)
    await pause(spawnedAt + 65_000 - Date.now())
    const ticks = totalsByTick(await sampler.stop())
    const startup = at(ticks, spawnedAt + 5_000)
    const idle = window(ticks, spawnedAt + 5_000, spawnedAt + 65_000)
    return {
      machine: before,
      samplerFirstTickMs: ticks[0].t - spawnedAt,
      startupAt5s: { processes: startup.processes, ws: startup.ws, priv: startup.priv, wsPriv: startup.wsPriv },
      idle60s: idle,
      idleEnd: window(ticks, spawnedAt + 60_000, spawnedAt + 65_000)
    }
  } finally {
    killTree(app.pid)
    await pause(1000)
    await rm(profile, { recursive: true, force: true })
  }
}

/** Launches under Playwright and waits for the UI to be usable. */
async function launch(profile) {
  const started = Date.now()
  const application = await electronTest.launch({ executablePath: electronPath, args: ['.', `--user-data-dir=${profile}`], cwd: root, env, timeout: 60_000 })
  const page = await application.firstWindow()
  await page.getByRole('button', { name: 'Import OpenAPI / Swagger', exact: true }).waitFor({ timeout: 60_000 })
  return { application, page, readyMs: Date.now() - started }
}

async function search(page, query) {
  await page.keyboard.press('Control+K')
  const box = page.getByRole('searchbox', { name: 'Search project', exact: true })
  await box.fill(query)
  await page.getByRole('listbox', { name: 'Search matches' }).getByRole('option').first().waitFor({ timeout: 10_000 })
  return box
}

async function openLargeEndpoint(page) {
  const box = await search(page, '/bench/large-json')
  await page.getByRole('listbox', { name: 'Search matches' }).getByRole('option').first().click()
  await box.fill('')
}

async function sendLarge(page) {
  await page.getByRole('tab', { name: 'Request' }).click()
  await page.getByRole('button', { name: 'Send' }).click()
  await page.locator('.response-meta', { hasText: '(truncated)' }).waitFor({ timeout: 60_000 })
}

const actions = {
  async import({ application, page }) {
    const file = join(DEFAULT_OUT, 'openapi-1000.json')
    await application.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    }, file)
    await page.getByRole('button', { name: 'Import OpenAPI / Swagger', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Import OpenAPI / Swagger' })
    await dialog.getByRole('button', { name: 'Choose file…' }).click()
    await dialog.getByRole('radio', { name: /New project/ }).check({ timeout: 30_000 })
    await dialog.getByRole('button', { name: 'Import 1000 endpoints' }).click()
    await page.getByText('Imported 1000 endpoints', { exact: false }).waitFor({ timeout: 60_000 })
  },
  async search({ page }) {
    for (let round = 0; round < 3; round++) {
      for (const query of ['Get', 'Change', 'bench', 'large', '42']) {
        const box = await search(page, query)
        await box.fill('')
      }
    }
  },
  async 'open-10'({ page }) {
    for (let index = 0; index < 10; index++) {
      await page.locator('.tree-record').nth(index).click()
      await pause(300)
    }
  },
  async 'large-response'({ page }) {
    await openLargeEndpoint(page)
    await sendLarge(page)
  },
  async 'project-switch'({ page }) {
    const switcher = page.getByRole('combobox', { name: 'Active project' })
    for (let round = 0; round < 2; round++) {
      for (let project = 1; project <= 10; project++) {
        await switcher.selectOption({ label: `Bench project ${project}` })
        await pause(300)
      }
    }
  }
}

const SETTLE_MS = 5_000
const BEFORE_MS = 3_000

/** One Playwright scenario: 3 s before, the action, 5 s after. */
async function driven(name, run) {
  const profile = await freshProfile()
  const csv = join(OUT, `${name}-run${run}.csv`)
  const before = machine()
  const { application, page, readyMs } = await launch(profile)
  const pid = application.process().pid
  try {
    const sampler = await startSampler(pid, csv)
    await pause(BEFORE_MS)
    const actionStart = Date.now()
    const marks = name === 'continuous' ? await continuous(page) : (await actions[name]({ application, page }), [])
    const actionEnd = Date.now()
    await pause(SETTLE_MS)
    const ticks = totalsByTick(await sampler.stop())
    const result = {
      machine: before,
      readyMs,
      actionMs: actionEnd - actionStart,
      before: window(ticks, actionStart - BEFORE_MS, actionStart),
      during: window(ticks, actionStart, actionEnd),
      after: window(ticks, actionEnd + SETTLE_MS - 2_000, actionEnd + SETTLE_MS)
    }
    if (marks.length) {
      const points = marks.map((t, index) => [index, at(ticks, t).priv])
      result.iterations = marks.length
      result.privAtIteration = points.map(([, priv]) => priv)
      result.privSlopeBytesPerIteration = slope(points)
      result.privSlopeSecondHalf = slope(points.slice(Math.floor(points.length / 2)))
    }
    return result
  } finally {
    await application.close().catch(() => killTree(pid))
    killTree(pid)
    await pause(1000)
    await rm(profile, { recursive: true, force: true })
  }
}

const ITERATIONS = 20

/** Continuous use: each iteration switches project, searches, opens 5 endpoints and sends the large response. Returns the end time of each iteration, taken 1 s after it settles. */
async function continuous(page) {
  const marks = []
  const switcher = page.getByRole('combobox', { name: 'Active project' })
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    await switcher.selectOption({ label: `Bench project ${(iteration % 10) + 1}` })
    const box = await search(page, ['Get', 'Change', 'bench'][iteration % 3])
    await box.fill('')
    for (let index = 1; index <= 5; index++) await page.locator('.tree-record').nth(index).click()
    await openLargeEndpoint(page)
    await sendLarge(page)
    await pause(1000)
    marks.push(Date.now())
  }
  return marks
}

function summarize(runs) {
  const ok = runs.filter(run => !run.error)
  const across = pick => {
    const values = ok.map(pick).filter(value => typeof value === 'number')
    return values.length ? { median: median(values), min: Math.min(...values), max: Math.max(...values), n: values.length } : null
  }
  const metrics = section => Object.fromEntries(['processes', 'ws', 'priv', 'wsPriv'].map(key => [key, {
    median: across(run => section(run)?.[key]?.median),
    peak: across(run => section(run)?.[key]?.max)
  }]))
  if (ok[0]?.idle60s) {
    return {
      startupAt5s: Object.fromEntries(['processes', 'ws', 'priv', 'wsPriv'].map(key => [key, across(run => run.startupAt5s[key])])),
      idle60s: metrics(run => run.idle60s),
      idleEnd: metrics(run => run.idleEnd)
    }
  }
  return {
    readyMs: across(run => run.readyMs),
    actionMs: across(run => run.actionMs),
    before: metrics(run => run.before),
    during: metrics(run => run.during),
    after: metrics(run => run.after),
    ...(ok[0]?.privSlopeBytesPerIteration !== undefined && {
      privSlopeBytesPerIteration: across(run => run.privSlopeBytesPerIteration),
      privSlopeSecondHalf: across(run => run.privSlopeSecondHalf)
    })
  }
}

await mkdir(OUT, { recursive: true })
const fixtures = await writeFixtures()
const server = await startBenchServer()
const electronVersion = JSON.parse(await readFile(join(root, 'node_modules/electron/package.json'), 'utf8')).version
const summary = {
  host: 'electron',
  electronVersion,
  startedAt: new Date().toISOString(),
  environment: { cpu: cpus()[0].model, cores: cpus().length, totalMemBytes: totalmem(), os: release(), node: process.version },
  method: { runs: RUNS, warmUpLaunch: true, samplerIntervalMs: 100, beforeMs: BEFORE_MS, settleMs: SETTLE_MS, continuousIterations: ITERATIONS },
  fixtures,
  scenarios: {}
}
try {
  // The first launch after a build is a cold start (disk cache, Defender scan) and can exceed
  // the launch timeout. One discarded launch keeps that out of the measured runs.
  process.stdout.write('warm-up launch… ')
  const warmProfile = await freshProfile()
  const warm = await launch(warmProfile)
  summary.warmUpReadyMs = warm.readyMs
  await warm.application.close()
  await pause(2000)
  await rm(warmProfile, { recursive: true, force: true })
  console.log(`ready in ${warm.readyMs} ms`)
  for (const name of SCENARIOS.filter(scenario => selected.includes(scenario))) {
    const runs = []
    for (let run = 1; run <= RUNS; run++) {
      process.stdout.write(`${name} run ${run}/${RUNS}… `)
      try {
        runs.push(name === 'startup-idle' ? await startupIdle(run) : await driven(name, run))
        console.log('ok')
      } catch (error) {
        runs.push({ error: String(error?.stack ?? error) })
        console.log(`FAILED: ${error?.message ?? error}`)
      }
      await pause(2000)
    }
    summary.scenarios[name] = { runs, summary: summarize(runs) }
    await writeFile(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  }
  summary.serverHits = Object.fromEntries([...server.hits].filter(([path]) => path.startsWith('/bench/')))
  summary.finishedAt = new Date().toISOString()
  await writeFile(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(`Wrote ${join(OUT, 'summary.json')}`)
} finally {
  await server.close()
}
