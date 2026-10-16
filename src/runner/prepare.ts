import { substitute, type ScopeValues } from '../environments/variables'
import type { Endpoint, HttpMethod, KeyValue, RequestBody } from '../workspace/types'

/** The mutable request that scripts see and that gets sent. Plain data. */
export interface RequestDraft {
  method: HttpMethod
  /** Absolute URL or a path template that the environment base URL is prepended to. */
  url: string
  query: KeyValue[]
  headers: KeyValue[]
  pathParams: KeyValue[]
  cookies: KeyValue[]
  body: RequestBody
}

export interface PreparedRequest {
  method: HttpMethod
  url: string
  headers: [string, string][]
  /** Serialized body; form-data is sent as multipart by the HTTP layer. */
  body?: { kind: 'text'; text: string } | { kind: 'form-data'; fields: [string, string][] }
  unresolved: string[]
}

export function draftFromEndpoint(endpoint: Endpoint): RequestDraft {
  return structuredClone({
    method: endpoint.method,
    url: endpoint.path,
    query: endpoint.query,
    headers: endpoint.headers,
    pathParams: endpoint.pathParams,
    cookies: endpoint.cookies,
    body: endpoint.body
  })
}

/**
 * Prepends the environment base URL unless the URL is already absolute or
 * starts with a variable (Apidog's rule). Unlike Apidog's plain concatenation,
 * duplicate or missing slashes at the join are normalized.
 */
export function joinBaseUrl(baseUrl: string | undefined, url: string): string {
  if (!baseUrl || /^https?:\/\//i.test(url) || url.trimStart().startsWith('{{')) return url
  if (!url) return baseUrl
  return `${baseUrl.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
}

const CONTENT_TYPES: Partial<Record<RequestBody['mode'], string>> = {
  json: 'application/json',
  xml: 'application/xml',
  text: 'text/plain',
  'form-urlencoded': 'application/x-www-form-urlencoded'
}

/**
 * Resolves `{{variables}}` in URL, path/query params, headers, cookies and
 * body, skipping disabled rows, then assembles the wire request.
 */
export function prepareRequest(draft: RequestDraft, scopes: ScopeValues, baseUrl?: string): PreparedRequest {
  const unresolved = new Set<string>()
  const resolve = (text: string) => {
    const result = substitute(text, scopes)
    result.unresolved.forEach(name => unresolved.add(name))
    return result.value
  }
  const enabled = (rows: KeyValue[]) => rows.filter(row => row.enabled && row.key.trim())

  let url = resolve(joinBaseUrl(baseUrl === undefined ? undefined : resolve(baseUrl), draft.url))
  // OpenAPI-style {param} path placeholders.
  for (const param of enabled(draft.pathParams)) {
    url = url.split(`{${param.key}}`).join(encodeURIComponent(resolve(param.value)))
  }
  const query = enabled(draft.query).map(row => [resolve(row.key), resolve(row.value)] as const)
  if (query.length) {
    const [beforeHash, hash] = url.split('#', 2)
    const search = query.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
    url = `${beforeHash}${beforeHash.includes('?') ? '&' : '?'}${search}${hash === undefined ? '' : `#${hash}`}`
  }

  const headers: [string, string][] = enabled(draft.headers).map(row => [resolve(row.key), resolve(row.value)])
  const cookies = enabled(draft.cookies).map(row => `${resolve(row.key)}=${resolve(row.value)}`)
  if (cookies.length) {
    const existing = headers.findIndex(([name]) => name.toLowerCase() === 'cookie')
    if (existing === -1) headers.push(['Cookie', cookies.join('; ')])
    else headers[existing] = [headers[existing][0], `${headers[existing][1]}; ${cookies.join('; ')}`]
  }

  let body: PreparedRequest['body']
  const mode = draft.body.mode
  if (draft.method !== 'GET' && draft.method !== 'HEAD' && mode !== 'none') {
    if (mode === 'form-data') {
      body = { kind: 'form-data', fields: enabled(draft.body.form ?? []).map(row => [resolve(row.key), resolve(row.value)]) }
    } else if (mode === 'form-urlencoded') {
      const params = new URLSearchParams(enabled(draft.body.form ?? []).map(row => [resolve(row.key), resolve(row.value)]))
      body = { kind: 'text', text: params.toString() }
    } else {
      body = { kind: 'text', text: resolve(draft.body.raw ?? '') }
    }
    const contentType = draft.body.contentType ?? CONTENT_TYPES[mode]
    if (contentType && mode !== 'form-data' && !headers.some(([name]) => name.toLowerCase() === 'content-type')) {
      headers.push(['Content-Type', contentType])
    }
  }
  return { method: draft.method, url, headers, body, unresolved: [...unresolved] }
}
