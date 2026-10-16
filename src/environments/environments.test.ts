// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createDemoProject } from '../workspace/demo'
import type { Project, Variable } from '../workspace/types'
import { draftFromEndpoint, joinBaseUrl, prepareRequest, type RequestDraft } from '../runner/prepare'
import { addEnvironment, deleteEnvironment, duplicateEnvironment, renameEnvironment, setActiveEnvironment } from './operations'
import { buildContext, emptyScopes, lookup, MAX_PASSES, redact, substitute, type ScopeValues } from './variables'

const scopes = (local: Record<string, string>, environment: Record<string, string> = {}, global: Record<string, string> = {}): ScopeValues => ({
  local: new Map(Object.entries(local)), environment: new Map(Object.entries(environment)), global: new Map(Object.entries(global))
})
const variable = (key: string, value: string, extra: Partial<Variable> = {}): Variable => ({ id: `var_${key}_${value}`, key, value, secret: false, enabled: true, ...extra })

describe('variable resolution', () => {
  it('applies precedence local > environment > global', () => {
    const values = scopes({ a: 'local' }, { a: 'env', b: 'env' }, { a: 'global', b: 'global', c: 'global' })
    expect(substitute('{{a}}/{{b}}/{{c}}', values).value).toBe('local/env/global')
  })

  it('builds scopes from the active environment and globals, skipping disabled and blank rows', () => {
    const project: Project = {
      ...createDemoProject(),
      environments: [{ id: 'e', name: 'E', baseUrl: '', variables: [variable('host', 'env.test'), variable('off', 'x', { enabled: false }), variable('host', 'second'), variable(' ', 'blank')] }],
      activeEnvironmentId: 'e',
      globals: [variable('host', 'global.test'), variable('off', 'global-off'), variable('token', '', { secret: true, id: 'secret1' })]
    }
    const context = buildContext(project, item => item.id === 'secret1' ? 's3cr3t' : undefined)
    expect(substitute('{{host}} {{off}} {{token}}', context.scopes).value).toBe('env.test global-off s3cr3t')
    expect(context.secretValues).toEqual(['s3cr3t'])
    const withoutSecrets = buildContext(project)
    expect(substitute('{{token}}', withoutSecrets.scopes)).toEqual({ value: '{{token}}', unresolved: ['token'] })
    expect(buildContext({ ...project, activeEnvironmentId: null }).scopes.environment.size).toBe(0)
  })

  it('resolves nested and recursive variables, trims names, and leaves unresolved tokens literal', () => {
    const values = scopes({}, { host: '{{sub}}.example.test', sub: 'api', id: 'name', name: 'Ada' })
    expect(substitute('https://{{ host }}/users/{{{{id}}}}', values)).toEqual({ value: 'https://api.example.test/users/Ada', unresolved: [] })
    expect(substitute('{{missing}} and {{host}}', values)).toEqual({ value: '{{missing}} and api.example.test', unresolved: ['missing'] })
  })

  it('stops self-referencing variables after the pass limit', () => {
    const result = substitute('{{loop}}', scopes({ loop: 'x{{loop}}' }))
    expect(result.value).toBe(`${'x'.repeat(MAX_PASSES)}{{loop}}`)
  })

  it('supports JSON path access and exact dotted names', () => {
    const values = scopes({ user: '{"id":7,"tags":["a","b"],"profile":{"name":"Ada"}}', 'a.b': 'exact' })
    expect(lookup(values, 'user.id')).toBe('7')
    expect(lookup(values, 'user.tags[1]')).toBe('b')
    expect(lookup(values, 'user.profile')).toBe('{"name":"Ada"}')
    expect(lookup(values, 'a.b')).toBe('exact')
    expect(lookup(values, 'user.nope')).toBeUndefined()
    expect(lookup(emptyScopes(), 'x.y')).toBeUndefined()
  })

  it('redacts every occurrence of every secret, longest first', () => {
    expect(redact('token=abc123; again abc123; short=abc', ['abc', 'abc123'])).toBe('token=••••••; again ••••••; short=••••••')
  })
})

describe('request preparation', () => {
  it('prepends the base URL unless the URL is absolute or starts with a variable', () => {
    expect(joinBaseUrl('https://api.test/v1/', '/users')).toBe('https://api.test/v1/users')
    expect(joinBaseUrl('https://api.test/v1', 'users')).toBe('https://api.test/v1/users')
    expect(joinBaseUrl('https://api.test', 'http://other.test/x')).toBe('http://other.test/x')
    expect(joinBaseUrl('https://api.test', '{{host}}/x')).toBe('{{host}}/x')
    expect(joinBaseUrl(undefined, '/x')).toBe('/x')
  })

  it('resolves variables in URL, path params, query, headers, cookies and body, skipping disabled rows', () => {
    const draft: RequestDraft = {
      method: 'POST',
      url: '/users/{userId}/items',
      pathParams: [{ key: 'userId', value: '{{user}}', enabled: true }],
      query: [{ key: 'q', value: '{{term}}', enabled: true }, { key: 'off', value: '1', enabled: false }],
      headers: [{ key: 'X-Token', value: 'Bearer {{token}}', enabled: true }, { key: 'X-Off', value: 'no', enabled: false }],
      cookies: [{ key: 'session', value: '{{sid}}', enabled: true }],
      body: { mode: 'json', raw: '{"name":"{{name}}"}' }
    }
    const values = scopes({}, { user: 'u 1', term: 'a&b', token: 't0k', sid: 's1', name: 'Ada', base: 'api.test' })
    const prepared = prepareRequest(draft, values, 'https://{{base}}')
    expect(prepared.url).toBe('https://api.test/users/u%201/items?q=a%26b')
    expect(prepared.headers).toEqual([['X-Token', 'Bearer t0k'], ['Cookie', 'session=s1'], ['Content-Type', 'application/json']])
    expect(prepared.body).toEqual({ kind: 'text', text: '{"name":"Ada"}' })
    expect(prepared.unresolved).toEqual([])
  })

  it('encodes form bodies, keeps explicit content types, and omits bodies for GET', () => {
    const base: RequestDraft = { method: 'POST', url: 'https://x.test', query: [], headers: [{ key: 'content-type', value: 'text/custom', enabled: true }], pathParams: [], cookies: [], body: { mode: 'form-urlencoded', form: [{ key: 'a', value: '{{v}}', enabled: true }, { key: 'b', value: 'x y', enabled: true }] } }
    const prepared = prepareRequest(base, scopes({ v: '1&2' }))
    expect(prepared.body).toEqual({ kind: 'text', text: 'a=1%262&b=x+y' })
    expect(prepared.headers).toEqual([['content-type', 'text/custom']])
    expect(prepareRequest({ ...base, method: 'GET' }, scopes({})).body).toBeUndefined()
    expect(prepareRequest({ ...base, body: { mode: 'form-data', form: [{ key: 'f', value: 'v', enabled: true }] } }, scopes({})).body).toEqual({ kind: 'form-data', fields: [['f', 'v']] })
  })

  it('reports unresolved variables and appends query to existing search parameters', () => {
    const draft = { ...draftFromEndpoint(createDemoProject().endpoints[0]), url: '/v1/users?page=1#top', query: [{ key: 'size', value: '{{pageSize}}', enabled: true }] }
    const prepared = prepareRequest(draft, scopes({}), '{{missingBase}}')
    expect(prepared.url).toBe('{{missingBase}}/v1/users?page=1&size=%7B%7BpageSize%7D%7D#top')
    expect(prepared.unresolved.sort()).toEqual(['missingBase', 'pageSize'])
  })
})

describe('environment operations', () => {
  const blank = (): Project => ({ ...createDemoProject(), environments: [], activeEnvironmentId: null })

  it('creates environments with unique names and auto-selects a lone environment', () => {
    const first = addEnvironment(blank(), 'Dev', 'http://127.0.0.1')
    expect(first.project.activeEnvironmentId).toBe(first.environment.id)
    const second = addEnvironment(first.project, 'dev')
    expect(second.environment.name).toBe('dev 2')
    expect(second.project.activeEnvironmentId).toBe(first.environment.id)
  })

  it('renames (ignoring blank names), switches, and resets the active one on delete', () => {
    const { project, environment } = addEnvironment(blank(), 'Dev')
    expect(renameEnvironment(project, environment.id, '  ').environments[0].name).toBe('Dev')
    const renamed = renameEnvironment(project, environment.id, ' Staging ')
    expect(renamed.environments[0].name).toBe('Staging')
    expect(setActiveEnvironment(renamed, 'unknown')).toBe(renamed)
    expect(setActiveEnvironment(renamed, null).activeEnvironmentId).toBeNull()
    expect(deleteEnvironment(renamed, environment.id)).toMatchObject({ environments: [], activeEnvironmentId: null })
  })

  it('duplicates with new IDs right after the source, copying plain values and marking secrets to copy', () => {
    const start = addEnvironment(blank(), 'Prod', 'https://prod.test')
    const project: Project = {
      ...start.project,
      environments: [{ ...start.environment, variables: [variable('a', '1'), { ...variable('key', '', { secret: true }), hasStoredSecret: true }] }]
    }
    const { project: next, environment } = duplicateEnvironment(project, start.environment.id)
    expect(next.environments.map(item => item.name)).toEqual(['Prod', 'Prod copy'])
    expect(environment!.baseUrl).toBe('https://prod.test')
    expect(environment!.variables[0]).toMatchObject({ key: 'a', value: '1' })
    expect(environment!.variables[1]).toMatchObject({ key: 'key', value: '', secret: true, copySecretFrom: project.environments[0].variables[1].id })
    expect(environment!.variables.every((item, index) => item.id !== project.environments[0].variables[index].id)).toBe(true)
  })
})
