import type { SearchField, SearchMatch, SearchOptions, SearchRecord, SearchRepository, SearchResult } from './types'

/** Fields are explicit: descriptions/content/credentials never enter the index. */
export function fieldText(record: SearchRecord, field: SearchField): string {
  if (field === 'tags') return (record.tags ?? []).join(' · ')
  if (field === 'folder') return record.breadcrumbs.join(' / ')
  return record[field] ?? ''
}

/**
 * Escape literal path punctuation before replacing {parameters}. The stricter,
 * anchored match is a deliberate Reqora choice; see the evidence report.
 */
export function matchesParameterizedPath(path: string, query: string): boolean {
  if (!/\{[^{}]+\}/.test(path)) return false
  let candidate = query
  if (/^https?:\/\//i.test(candidate)) {
    try { candidate = new URL(candidate).pathname } catch { return false }
  }
  const segments = path.split(/(\{[^{}]+\})/g)
  const pattern = segments.map(part => /^\{[^{}]+\}$/.test(part)
    ? '[^/?#]+'
    : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')
  return new RegExp(`^${pattern}$`, 'i').test(candidate)
}

/** Literal ranges only. No user text is interpreted as HTML or a regex. */
export function matchRanges(text: string, query: string): { start: number; end: number }[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  // Lowercasing can change UTF-16 length (e.g. İ). Retain an index map so
  // highlighting always refers to the original displayed string.
  const folded = text.toLowerCase()
  const starts: number[] = []
  const ends: number[] = []
  let offset = 0
  for (const character of text) {
    const lower = character.toLowerCase()
    for (let i = 0; i < lower.length; i++) {
      starts.push(offset)
      ends.push(offset + character.length)
    }
    offset += character.length
  }
  const ranges: { start: number; end: number }[] = []
  let at = folded.indexOf(needle)
  while (at !== -1) {
    const range = { start: starts[at], end: ends[at + needle.length - 1] }
    const last = ranges.at(-1)
    if (last && range.start < last.end) last.end = Math.max(last.end, range.end)
    else ranges.push(range)
    at = folded.indexOf(needle, at + needle.length)
  }
  return ranges
}

function ancestors(record: SearchRecord, byId: Map<string, SearchRecord>): string[] {
  const result: string[] = []
  const visited = new Set([record.id])
  let parentId = record.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    result.unshift(parentId)
    parentId = parent.parentId
  }
  return result
}

/** Pure, deterministic renderer search. No Electron, storage, or network imports. */
export function searchRecords(records: readonly SearchRecord[], query: string, options: SearchOptions): SearchResult[] {
  const needle = query.trim()
  const byId = new Map(records.map(record => [record.id, record]))
  const fields = [...new Set(options.fields)]
  const results: SearchResult[] = []
  for (const record of records) {
    if (!options.kinds.includes(record.kind)) continue
    const passesFilters = (options.filters ?? []).every(filter => {
      if (!filter.values.length) return true
      const value = record[filter.key]
      // Matches the inspected predicate: missing metadata fails even exclusion.
      if (value === undefined) return false
      const includes = Array.isArray(value)
        ? value.some(entry => filter.values.includes(entry))
        : filter.values.includes(value)
      return filter.exclude ? !includes : includes
    })
    if (!passesFilters) continue
    const matches: SearchMatch[] = []
    for (const field of fields) {
      const values = field === 'tags' ? record.tags ?? [] : field === 'folder' ? record.breadcrumbs : [fieldText(record, field)]
      const separator = field === 'tags' ? ' · ' : ' / '
      let offset = 0
      for (const value of values) {
        for (const range of matchRanges(value, needle)) matches.push({ field, start: offset + range.start, end: offset + range.end })
        offset += value.length + separator.length
      }
    }
    const routeMatch = needle && fields.includes('path') && record.path && matchesParameterizedPath(record.path, needle)
    if (!needle || matches.length || routeMatch) {
      if (routeMatch && !matches.some(match => match.field === 'path')) matches.push({ field: 'path', start: 0, end: record.path!.length })
      results.push({ record, matches, ancestors: ancestors(record, byId) })
    }
  }
  return results
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError')
}

/**
 * Promise-based seam for a future main-process adapter. Replace the implementation,
 * preserving this serializable contract; UI components need no IPC knowledge.
 */
export function createMemorySearchRepository(initialRecords: readonly SearchRecord[]): SearchRepository & {
  replaceRecords(records: readonly SearchRecord[]): void
} {
  let records = structuredClone([...initialRecords])
  return {
    async getAll() { return structuredClone(records) },
    async search(query, options, signal) {
      assertNotAborted(signal)
      // Yield once so obsolete requests can be cancelled before computing.
      await Promise.resolve()
      assertNotAborted(signal)
      return structuredClone(searchRecords(records, query, options))
    },
    replaceRecords(next) { records = structuredClone([...next]) }
  }
}
