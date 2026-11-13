import { median } from './sampler.mjs'

/** { median, min, max } of each metric over the ticks in [from, to]. */
export function window(ticks, from, to) {
  const inside = ticks.filter(tick => tick.t >= from && tick.t <= to)
  if (!inside.length) return null
  const stats = key => {
    const values = inside.map(tick => tick[key])
    return { median: median(values), min: Math.min(...values), max: Math.max(...values) }
  }
  return { ticks: inside.length, processes: stats('processes'), ws: stats('ws'), priv: stats('priv'), wsPriv: stats('wsPriv') }
}

/** The tick closest to `t`. */
export function at(ticks, t) {
  return ticks.reduce((best, tick) => Math.abs(tick.t - t) < Math.abs(best.t - t) ? tick : best)
}
