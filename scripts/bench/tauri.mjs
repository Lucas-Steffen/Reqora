import { chromium } from 'playwright'
import { execFileSync, spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, freemem, release, tmpdir, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_OUT, writeFixtures } from './fixtures.mjs'
import { median, startSampler, totalsByTick } from './sampler.mjs'
import { at, window } from './stats.mjs'

/**
 * Tauri prototype memory gate (TASK-007): startup and idle only, measured the
 * same way as the Electron baseline in electron.mjs.
 *
 *   node scripts/bench/tauri.mjs --build              bench build (see below)
 *   node scripts/bench/tauri.mjs --verify             one unmeasured launch over CDP: the fixture is on screen
 *   node scripts/bench/tauri.mjs [--runs 5] [--out dir] [--label name]
 *
 * The bench build differs from the release build in one way: the renderer is
 * built with VITE_REQORA_BENCH_WORKSPACE, so the memory adapter fetches
 * workspace-10x100.json (copied next to index.html) instead of opening the
 * sample workspace. It goes to its own target dir, so target/release stays the
 * normal build. Every measured run launches the executable directly, with no
 * automation attached, and a fresh WebView2 profile (WEBVIEW2_USER_DATA_FOLDER),
 * as Electron gets a fresh --user-data-dir.
 */

const root = resolve(import.meta.dirname, '../..')
const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : fallback
}
const RUNS = Number(option('runs', 5))
const LABEL = option('label', 'default')
const OUT = resolve(option('out', join(root, 'docs/migration/bench-results/tauri', LABEL)))
const RENDERER = join(root, 'out/tauri-bench-renderer')
const TARGET = join(root, 'src-tauri/target/bench')
const EXE = join(TARGET, 'release/reqora.exe')
const BENCH_FILE = 'bench-workspace.json'

const pause = ms => new Promise(done => setTimeout(done, ms))

function run(command, args, env = process.env) {
  execFileSync(command, args, { cwd: root, env, stdio: 'inherit', shell: true })
}

async function build() {
  await writeFixtures()
  run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.renderer.config.ts', '--outDir', '../../out/tauri-bench-renderer'],
    { ...process.env, VITE_REQORA_BENCH_WORKSPACE: `/${BENCH_FILE}` })
  await copyFile(join(DEFAULT_OUT, 'workspace-10x100.json'), join(RENDERER, BENCH_FILE))
  const config = join(root, '.bench/tauri-bench.conf.json')
  await mkdir(join(root, '.bench'), { recursive: true })
  await writeFile(config, JSON.stringify({ build: { beforeBuildCommand: '', frontendDist: '../out/tauri-bench-renderer' } }))
  run('pnpm', ['tauri', 'build', '--no-bundle', '--config', `"${config}"`], { ...process.env, CARGO_TARGET_DIR: TARGET })
}

function killTree(pid) {
  try { execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
}

function machine() {
  return { freeMemBytes: freemem(), totalMemBytes: totalmem() }
}

function webView2Version() {
  const key = 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  try { return /pv\s+REG_SZ\s+(\S+)/.exec(execFileSync('reg', ['query', key, '/v', 'pv'], { encoding: 'utf8' }))?.[1] ?? null } catch { return null }
}

async function launch(extraEnv = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'reqora-bench-tauri-'))
  const app = spawn(EXE, [], { cwd: root, env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, ...extraEnv }, stdio: 'ignore' })
  return { app, profile }
}

async function close({ app, profile }) {
  killTree(app.pid)
  await pause(1500)
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}

/** Unmeasured launch with a debugger attached: the fixture's projects must be on screen. */
async function verify() {
  const port = 9333
  const launched = await launch({ WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` })
  try {
    let browser
    for (let attempt = 0; !browser; attempt++) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`) } catch (error) { if (attempt > 40) throw error; await pause(500) }
    }
    const page = browser.contexts()[0].pages()[0]
    const switcher = page.getByRole('combobox', { name: 'Active project' })
    await switcher.waitFor({ timeout: 30_000 })
    const projects = await switcher.locator('option').allTextContents()
    const profileUsed = (await readFile(join(launched.profile, 'EBWebView', 'Local State'), 'utf8').then(() => true, () => false))
    await browser.close()
    console.log(JSON.stringify({ projects, freshProfileUsed: profileUsed }))
    if (!projects.includes('Bench project 1') || projects.length !== 10) throw new Error('bench fixture not loaded')
  } finally {
    await close(launched)
  }
}

/** Startup and idle: plain launch, memory at T+5 s and over the next 60 s. */
async function startupIdle(index) {
  const csv = join(OUT, `startup-idle-run${index}.csv`)
  const before = machine()
  const spawnedAt = Date.now()
  const launched = await launch()
  try {
    const sampler = await startSampler(launched.app.pid, csv)
    await pause(spawnedAt + 65_000 - Date.now())
    const ticks = totalsByTick(await sampler.stop())
    const startup = at(ticks, spawnedAt + 5_000)
    return {
      machine: before,
      samplerFirstTickMs: ticks[0].t - spawnedAt,
      startupAt5s: { processes: startup.processes, ws: startup.ws, priv: startup.priv, wsPriv: startup.wsPriv },
      idle60s: window(ticks, spawnedAt + 5_000, spawnedAt + 65_000),
      idleEnd: window(ticks, spawnedAt + 60_000, spawnedAt + 65_000)
    }
  } finally {
    await close(launched)
  }
}

function summarize(runs) {
  const ok = runs.filter(entry => !entry.error)
  const across = pick => {
    const values = ok.map(pick).filter(value => typeof value === 'number')
    return values.length ? { median: median(values), min: Math.min(...values), max: Math.max(...values), n: values.length } : null
  }
  const metrics = section => Object.fromEntries(['processes', 'ws', 'priv', 'wsPriv'].map(key => [key, {
    median: across(entry => section(entry)?.[key]?.median),
    peak: across(entry => section(entry)?.[key]?.max)
  }]))
  return {
    startupAt5s: Object.fromEntries(['processes', 'ws', 'priv', 'wsPriv'].map(key => [key, across(entry => entry.startupAt5s[key])])),
    idle60s: metrics(entry => entry.idle60s),
    idleEnd: metrics(entry => entry.idleEnd)
  }
}

if (argv.includes('--build')) {
  await build()
} else if (argv.includes('--verify')) {
  await verify()
} else {
  await mkdir(OUT, { recursive: true })
  const fixtures = await writeFixtures()
  const summary = {
    host: 'tauri',
    label: LABEL,
    webView2Version: webView2Version(),
    startedAt: new Date().toISOString(),
    environment: { cpu: cpus()[0].model, cores: cpus().length, totalMemBytes: totalmem(), os: release(), node: process.version },
    method: { runs: RUNS, warmUpLaunch: true, samplerIntervalMs: 100, executable: 'src-tauri/target/bench/release/reqora.exe' },
    fixtures: { 'workspace-10x100.json': fixtures['workspace-10x100.json'] },
    scenarios: {}
  }
  // Same as the Electron baseline: one discarded launch keeps the cold start out of the runs.
  process.stdout.write('warm-up launch… ')
  const warm = await launch()
  await pause(8000)
  await close(warm)
  console.log('done')
  const runs = []
  for (let index = 1; index <= RUNS; index++) {
    process.stdout.write(`startup-idle run ${index}/${RUNS}… `)
    try {
      runs.push(await startupIdle(index))
      console.log('ok')
    } catch (error) {
      runs.push({ error: String(error?.stack ?? error) })
      console.log(`FAILED: ${error}`)
    }
  }
  summary.scenarios['startup-idle'] = { runs, summary: summarize(runs) }
  summary.finishedAt = new Date().toISOString()
  await writeFile(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(`Wrote ${join(OUT, 'summary.json')}`)
}
