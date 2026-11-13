import { spawn } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), 'sampler.ps1')

/**
 * Starts sampler.ps1 on the tree rooted at `rootPid` and resolves once it is
 * sampling. `stop()` ends it and returns the parsed rows. The sampler also
 * stops by itself when the root exits.
 */
export async function startSampler(rootPid, outFile, { intervalMs = 100 } = {}) {
  const stopFile = `${outFile}.stop`
  await rm(stopFile, { force: true })
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-RootPid', String(rootPid), '-OutFile', outFile, '-IntervalMs', String(intervalMs), '-StopFile', stopFile],
  { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let stdout = ''
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  const exited = new Promise(done => child.once('exit', code => done(code)))
  await new Promise((done, fail) => {
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (stdout.includes('READY')) done()
    })
    exited.then(code => fail(new Error(`sampler exited with ${code} before READY: ${stderr.trim()}`)))
  })
  return {
    pid: child.pid,
    async stop() {
      await writeFile(stopFile, '')
      const code = await exited
      await rm(stopFile, { force: true })
      if (code !== 0) throw new Error(`sampler exited with ${code}: ${stderr.trim()}`)
      return parseSamples(await readFile(outFile, 'utf8'))
    }
  }
}

/** Parses the sampler CSV into { t, pid, ppid, name, ws, priv, wsPriv, cpuMs } rows. */
export function parseSamples(text) {
  const [, ...lines] = text.trim().split(/\r?\n/)
  return lines.filter(Boolean).map(line => {
    const [t, pid, ppid, name, ws, priv, wsPriv, cpuMs] = line.split(',')
    return { t: Number(t), pid: Number(pid), ppid: Number(ppid), name, ws: Number(ws), priv: Number(priv), wsPriv: Number(wsPriv), cpuMs: Number(cpuMs) }
  })
}

/** Groups rows by tick and sums the tree: [{ t, processes, ws, priv, wsPriv, cpuMs }]. */
export function totalsByTick(rows) {
  const ticks = new Map()
  for (const row of rows) {
    const tick = ticks.get(row.t) ?? { t: row.t, processes: 0, ws: 0, priv: 0, wsPriv: 0, cpuMs: 0 }
    tick.processes++
    tick.ws += row.ws
    tick.priv += row.priv
    tick.wsPriv += row.wsPriv
    tick.cpuMs += row.cpuMs
    ticks.set(row.t, tick)
  }
  return [...ticks.values()].sort((a, b) => a.t - b.t)
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
