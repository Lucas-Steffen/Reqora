import { describe, expect, it } from 'vitest'
import { createMemorySearchRepository, matchRanges, matchesParameterizedPath, searchRecords } from './repository'
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions, type SearchRecord } from './types'

const records: SearchRecord[] = [
  { id: 'root', kind: 'folder', name: 'Store', breadcrumbs: [] },
  { id: 'accounts', parentId: 'root', kind: 'folder', name: 'Accounts', breadcrumbs: ['Store'] },
  { id: 'api-42', parentId: 'accounts', kind: 'api', name: 'List users', path: '/v1/users', method: 'GET', tags: ['customers', 'collection'], status: 'Released', maintainer: 'Alex', breadcrumbs: ['Store', 'Accounts'], description: 'DO_NOT_INDEX_DESCRIPTION', content: 'DO_NOT_INDEX_BODY' },
  { id: 'api-43', parentId: 'accounts', kind: 'api', name: 'Get user', path: '/v1/users/{id}', method: 'GET', tags: ['customers'], status: 'Draft', maintainer: 'Sam', breadcrumbs: ['Store', 'Accounts'] },
  { id: 'schema-1', parentId: 'accounts', kind: 'schema', name: 'User', breadcrumbs: ['Store', 'Accounts'] }
]
const options = (): SearchOptions => structuredClone(DEFAULT_SEARCH_OPTIONS)
const ids = (query: string, opts = options()) => searchRecords(records, query, opts).map(hit => hit.record.id)

describe('evidence-informed renderer search', () => {
  it('trims and matches case-insensitive literal substrings', () => {
    expect(ids('  LIST US  ')).toEqual(['api-42'])
    expect(ids(' USERS ')).toEqual(['api-42', 'api-43'])
  })
  it('treats spaces as part of a single query, without token AND or fuzzy matching', () => {
    expect(ids('users customers')).toEqual([])
    expect(ids('usr')).toEqual([])
  })
  it('searches IDs, tags, and ancestor names', () => {
    expect(ids('api-42')).toEqual(['api-42'])
    expect(ids('CUSTOMERS')).toEqual(['api-42', 'api-43'])
    expect(ids('Accounts')).toEqual(['accounts', 'api-42', 'api-43', 'schema-1'])
    expect(searchRecords(records, 'users', options())[0].ancestors).toEqual(['root', 'accounts'])
  })
  it('does not match across separate keywords or index method, description, and body', () => {
    for (const text of ['customers · collection', 'Store / Accounts', 'DO_NOT_INDEX_DESCRIPTION', 'DO_NOT_INDEX_BODY']) expect(ids(text)).toEqual([])
    expect(ids('GET', { fields: ['path', 'id', 'tags', 'folder'], kinds: ['api'] })).toEqual([])
  })
  it('preserves workspace order and respects selected fields and kinds', () => {
    expect(ids('user')).toEqual(['api-42', 'api-43', 'schema-1'])
    expect(ids('user', { fields: ['name'], kinds: ['schema'] })).toEqual(['schema-1'])
    expect(ids('/v1', { fields: ['name'], kinds: ['api'] })).toEqual([])
    expect(ids('user', { fields: [], kinds: ['api'] })).toEqual([])
    expect(ids('user', { fields: ['name'], kinds: [] })).toEqual([])
  })
  it('returns all allowed items for a blank query and handles an empty workspace', () => {
    expect(ids('  ')).toEqual(records.map(record => record.id))
    expect(searchRecords([], 'users', options())).toEqual([])
  })
  it('ANDs metadata categories, ORs selections, and combines them with text', () => {
    const opts = options()
    opts.filters = [{ key: 'status', values: ['Released', 'Draft'] }, { key: 'maintainer', values: ['Sam'] }]
    expect(ids('user', opts)).toEqual(['api-43'])
    opts.filters.push({ key: 'tags', values: ['collection', 'other'] })
    expect(ids('user', opts)).toEqual([])
  })
  it('supports tag exclusion and rejects missing metadata even in exclusion mode', () => {
    const opts = options()
    opts.filters = [{ key: 'tags', values: ['collection'], exclude: true }]
    expect(ids('user', opts)).toEqual(['api-43'])
    opts.filters = [{ key: 'status', values: [], exclude: true }]
    expect(ids('user', opts)).toEqual(['api-42', 'api-43', 'schema-1'])
  })
  it('matches concrete paths and full URLs against parameterized endpoints', () => {
    expect(ids('/v1/users/abc')).toEqual(['api-43'])
    expect(ids('https://api.example.com/v1/users/abc?expand=all')).toEqual(['api-43'])
    expect(searchRecords(records, '/v1/users/abc', options())[0].matches).toContainEqual({ field: 'path', start: 0, end: 14 })
  })
  it('escapes regex punctuation and anchors route matching (intentional improvement)', () => {
    expect(matchesParameterizedPath('/v1/file.json/{id}', '/v1/fileXjson/abc')).toBe(false)
    expect(matchesParameterizedPath('/v1/file.json/{id}', '/v1/file.json/abc')).toBe(true)
    expect(matchesParameterizedPath('/v1/users/{id}', 'prefix/v1/users/a/suffix')).toBe(false)
    expect(matchesParameterizedPath('/v1/users/{id}', '/v1/users/')).toBe(false)
    expect(matchesParameterizedPath('/v1/users/{id}', '/v1/users/a/b')).toBe(false)
    expect(matchesParameterizedPath('/v1/users/{id}', 'https://[')).toBe(false)
  })
  it('reports safe original-text ranges including Unicode lowercasing', () => {
    expect(matchRanges('İstanbul Users users', 'users')).toEqual([{ start: 9, end: 14 }, { start: 15, end: 20 }])
    expect(matchRanges('İstanbul', 'i')).toEqual([{ start: 0, end: 1 }])
    expect(matchRanges('a <script> x', '<script>')).toEqual([{ start: 2, end: 10 }])
    expect(matchRanges('abc', '[')).toEqual([])
    expect(matchRanges('ΟΣ', 'ΟΣ')).toEqual([{ start: 0, end: 2 }])
    expect(searchRecords([{ ...records[2], name: 'ΟΣ' }], 'ΟΣ', options())).toHaveLength(1)
  })
  it('guards cycles and missing parents when revealing ancestry', () => {
    const cyclic = records.map(record => ({ ...record }))
    cyclic[0].parentId = 'accounts'
    expect(searchRecords(cyclic, 'List', options())[0].ancestors).toEqual(['root', 'accounts'])
    expect(searchRecords([{ ...records[2], parentId: 'missing' }], 'List', options())[0].ancestors).toEqual([])
  })
})

describe('replaceable async repository boundary', () => {
  it('supports updates and deletion without stale results', async () => {
    const repository = createMemorySearchRepository(records)
    expect((await repository.search('List', options())).length).toBe(1)
    repository.replaceRecords(records.filter(record => record.id !== 'api-42'))
    expect(await repository.search('List', options())).toEqual([])
  })
  it('does not allow callers to mutate stored data through references', async () => {
    const original = structuredClone(records)
    const repository = createMemorySearchRepository(original)
    original[2].name = 'Mutated'
    const loaded = await repository.getAll()
    loaded[2].name = 'Also mutated'
    const results = await repository.search('List', options())
    results[0].record.name = 'Result mutated'
    expect((await repository.getAll())[2].name).toBe('List users')
  })
  it('rejects cancelled work before and after the async boundary', async () => {
    const repository = createMemorySearchRepository(records)
    const controller = new AbortController()
    const pending = repository.search('user', options(), controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await expect(repository.search('user', options(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
