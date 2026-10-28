import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Prints the Markdown result tables for a bench summary.json:
 *
 *   node scripts/bench/report.mjs docs/migration/bench-results/electron/summary.json
 *
 * Memory in MiB, as "median (min–max)" across the runs that completed.
 */

const file = resolve(process.argv[2] ?? 'docs/migration/bench-results/electron/summary.json')
const summary = JSON.parse(await readFile(file, 'utf8'))
const mib = bytes => (bytes / 1024 / 1024).toFixed(0)
const range = (stat, format = mib) => stat ? `${format(stat.median)} (${format(stat.min)}–${format(stat.max)})` : '—'
const count = value => String(Math.round(value))
const ms = value => String(Math.round(value))
const lines = []
const table = (header, rows) => {
  lines.push(`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`)
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`)
  lines.push('')
}

const scenarios = summary.scenarios
const ok = name => scenarios[name]?.runs.filter(run => !run.error).length ?? 0
const failed = name => scenarios[name]?.runs.filter(run => run.error).length ?? 0

const idle = scenarios['startup-idle']?.summary
if (idle) {
  lines.push(`### Inicialização e ocioso (sem automação; ${ok('startup-idle')} execuções válidas)`, '')
  table(['Momento', 'Processos', 'Residente (ws)', 'Privada (commit)', 'Residente privada (wsPriv)'], [
    ['T+5 s', range(idle.startupAt5s.processes, count), range(idle.startupAt5s.ws), range(idle.startupAt5s.priv), range(idle.startupAt5s.wsPriv)],
    ['Ocioso 5–65 s, mediana', range(idle.idle60s.processes.median, count), range(idle.idle60s.ws.median), range(idle.idle60s.priv.median), range(idle.idle60s.wsPriv.median)],
    ['Ocioso 5–65 s, pico', range(idle.idle60s.processes.peak, count), range(idle.idle60s.ws.peak), range(idle.idle60s.priv.peak), range(idle.idle60s.wsPriv.peak)],
    ['Fim do ocioso (60–65 s)', range(idle.idleEnd.processes.median, count), range(idle.idleEnd.ws.median), range(idle.idleEnd.priv.median), range(idle.idleEnd.wsPriv.median)]
  ])
}

const driven = Object.keys(scenarios).filter(name => name !== 'startup-idle')
if (driven.length) {
  lines.push('### Cenários com automação: tempos', '')
  table(['Cenário', 'Execuções válidas', 'UI pronta (ms)', 'Ação (ms)'], driven.map(name => {
    const s = scenarios[name].summary
    return [name, `${ok(name)}/${ok(name) + failed(name)}`, range(s.readyMs, ms), range(s.actionMs, ms)]
  }))
  for (const key of ['priv', 'wsPriv', 'ws']) {
    const label = { priv: 'Privada (commit)', wsPriv: 'Residente privada (wsPriv)', ws: 'Residente (ws)' }[key]
    lines.push(`### Cenários com automação: ${label}, MiB`, '')
    table(['Cenário', 'Antes (mediana)', 'Durante (mediana)', 'Pico durante', 'Depois (mediana)'], driven.map(name => {
      const s = scenarios[name].summary
      return [name, range(s.before[key].median), range(s.during[key].median), range(s.during[key].peak), range(s.after[key].median)]
    }))
  }
  const continuous = scenarios.continuous?.summary
  if (continuous?.privSlopeBytesPerIteration) {
    const kib = value => (value / 1024).toFixed(0)
    lines.push('### Uso contínuo: inclinação da memória privada', '')
    table(['Janela', 'KiB por iteração'], [
      ['Todas as iterações', range(continuous.privSlopeBytesPerIteration, kib)],
      ['Segunda metade', range(continuous.privSlopeSecondHalf, kib)]
    ])
  }
}
console.log(lines.join('\n'))
