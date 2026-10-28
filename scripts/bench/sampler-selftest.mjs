import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { median, startSampler, totalsByTick } from './sampler.mjs'

/**
 * Checks the sampler against a tree whose shape and memory are known: a Node
 * parent with two children, one of which writes 200 MB into a buffer. Run on
 * Windows: node scripts/bench/sampler-selftest.mjs
 */

const ALLOCATED = 200e6
const parentSource = `
const { spawn } = require('node:child_process')
const idle = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
const heavy = spawn(process.execPath, ['-e', 'globalThis.keep = Buffer.alloc(${ALLOCATED}, 1); console.log("ALLOCATED"); setInterval(() => {}, 1000)'], { stdio: ['ignore', 'pipe', 'ignore'] })
heavy.stdout.on('data', () => console.log(JSON.stringify({ idle: idle.pid, heavy: heavy.pid })))
process.on('SIGTERM', () => { idle.kill(); heavy.kill(); process.exit(0) })
setInterval(() => {}, 1000)
`

function fail(message) {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

const dir = await mkdtemp(join(tmpdir(), 'reqora-sampler-'))
const parent = spawn(process.execPath, ['-e', parentSource], { stdio: ['ignore', 'pipe', 'inherit'] })
try {
  const children = await new Promise((done, fail) => {
    parent.stdout.once('data', chunk => done(JSON.parse(String(chunk))))
    parent.once('exit', code => fail(new Error(`parent exited with ${code}`)))
  })
  const sampler = await startSampler(parent.pid, join(dir, 'samples.csv'))
  await new Promise(done => setTimeout(done, 3000))
  const rows = await sampler.stop()

  const pids = new Set(rows.map(row => row.pid))
  const expected = [parent.pid, children.idle, children.heavy]
  if (pids.size !== 3 || !expected.every(pid => pids.has(pid))) fail(`tree pids ${[...pids]} != ${expected}`)
  if (pids.has(sampler.pid) || pids.has(process.pid)) fail('sampler or harness measured itself')
  for (const row of rows) {
    const expectedParent = row.pid === parent.pid ? process.pid : parent.pid
    if (row.ppid !== expectedParent) fail(`pid ${row.pid} has ppid ${row.ppid}, expected ${expectedParent}`)
  }
  const heavy = rows.filter(row => row.pid === children.heavy).at(-1)
  if (!heavy || heavy.wsPriv < ALLOCATED * 0.95 || heavy.priv < ALLOCATED * 0.95) {
    fail(`heavy child private memory too low: wsPriv=${heavy?.wsPriv} priv=${heavy?.priv}`)
  }
  const ticks = totalsByTick(rows)
  const gaps = ticks.slice(1).map((tick, index) => tick.t - ticks[index].t)
  const gap = median(gaps)
  if (ticks.length < 20 || gap < 80 || gap > 150) fail(`${ticks.length} ticks, median gap ${gap} ms`)

  const mb = bytes => (bytes / 1048576).toFixed(1)
  const last = ticks.at(-1)
  console.log(`ticks=${ticks.length} medianGapMs=${gap} maxGapMs=${Math.max(...gaps)} processes=${last.processes}`)
  console.log(`tree ws=${mb(last.ws)} MiB priv=${mb(last.priv)} MiB wsPriv=${mb(last.wsPriv)} MiB; heavy wsPriv=${mb(heavy.wsPriv)} MiB`)
  if (!process.exitCode) console.log('PASS sampler self-test')
} finally {
  parent.kill()
  await rm(dir, { recursive: true, force: true })
}
