import { ImportError } from './errors'
import { parseDocument } from './parse'

/** Loads an absolute document URI (file: or http(s):). Implemented by the main process. */
export type ReferenceLoader = (uri: string) => Promise<string>

export interface RefLimits {
  /** Maximum number of documents, including the root. */
  maxDocuments: number
  /** Maximum objects/arrays visited while scanning for references. */
  maxNodes: number
}

export const DEFAULT_REF_LIMITS: RefLimits = { maxDocuments: 25, maxNodes: 250_000 }

export interface DocumentSet {
  rootUri: string
  documents: Map<string, unknown>
  warnings: string[]
}

type Json = unknown

function isObject(value: Json): value is Record<string, Json> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function splitRef(ref: string, baseUri: string): { uri: string; pointer: string } {
  const hash = ref.indexOf('#')
  const location = hash === -1 ? ref : ref.slice(0, hash)
  const pointer = hash === -1 ? '' : ref.slice(hash + 1)
  if (!location) return { uri: baseUri, pointer }
  try {
    const url = new URL(location, baseUri)
    url.hash = ''
    return { uri: url.toString(), pointer }
  } catch {
    throw new ImportError('PARSE', `The reference "${ref}" is not a valid URI.`)
  }
}

/** RFC 6901 pointer, accepting the URI-fragment (percent-encoded) form. */
export function readPointer(document: Json, pointer: string): Json {
  if (pointer === '' || pointer === '/') return pointer === '' ? document : (document as Record<string, Json>)?.['']
  if (!pointer.startsWith('/')) return undefined
  let current: Json = document
  for (const raw of pointer.slice(1).split('/')) {
    let segment: string
    try { segment = decodeURIComponent(raw) } catch { segment = raw }
    segment = segment.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(current)) current = current[Number(segment)]
    else if (isObject(current) && Object.hasOwn(current, segment)) current = current[segment]
    else return undefined
  }
  return current
}

/**
 * Loads every external document reachable through $ref, breadth-first, within
 * limits. A failed external load is a warning: those references stay unresolved.
 */
export async function loadDocumentSet(
  rootUri: string,
  root: Json,
  loader: ReferenceLoader,
  limits: RefLimits = DEFAULT_REF_LIMITS
): Promise<DocumentSet> {
  const documents = new Map<string, Json>([[rootUri, root]])
  const warnings: string[] = []
  const failed = new Set<string>()
  const queue: string[] = [rootUri]
  let nodes = 0
  while (queue.length) {
    const uri = queue.shift()!
    const pending = new Set<string>()
    const stack: Json[] = [documents.get(uri)]
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object') continue
      if (++nodes > limits.maxNodes) throw new ImportError('LIMIT', `The document is too complex to import (more than ${limits.maxNodes.toLocaleString('en-US')} objects).`)
      if (isObject(node) && typeof node.$ref === 'string') {
        const target = splitRef(node.$ref, uri).uri
        if (!documents.has(target) && !failed.has(target)) pending.add(target)
      }
      for (const child of Array.isArray(node) ? node : Object.values(node)) stack.push(child)
    }
    for (const target of pending) {
      if (documents.has(target) || failed.has(target)) continue
      if (documents.size >= limits.maxDocuments) {
        throw new ImportError('LIMIT', `The document references more than ${limits.maxDocuments - 1} external documents.`)
      }
      try {
        documents.set(target, parseDocumentLoose(await loader(target)))
        queue.push(target)
      } catch (error) {
        failed.add(target)
        const reason = error instanceof ImportError ? error.message : 'it could not be loaded'
        warnings.push(`External reference ${displayUri(target)} was not resolved: ${reason}`)
      }
    }
  }
  return { rootUri, documents, warnings }
}

/** External fragments may be any JSON/YAML value, not only OpenAPI roots. */
function parseDocumentLoose(text: string): Json {
  try {
    return parseDocument(text)
  } catch (error) {
    if (error instanceof ImportError && error.code === 'NOT_OPENAPI') return JSON.parse(text)
    throw error
  }
}

export function displayUri(uri: string): string {
  if (uri.startsWith('file:')) return decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1))
  try {
    const url = new URL(uri)
    return `${url.origin}${url.pathname}`
  } catch {
    return uri
  }
}

export interface Located<T = Json> {
  value: T
  /** Document URI the value was read from; relative refs inside it resolve against this. */
  uri: string
}

/** Synchronous resolver over a preloaded document set. */
export class RefResolver {
  readonly warnings = new Set<string>()

  constructor(private readonly set: DocumentSet) {}

  get rootUri(): string {
    return this.set.rootUri
  }

  get root(): Json {
    return this.set.documents.get(this.set.rootUri)
  }

  /** Follows a chain of $ref objects (not nested ones). Unresolvable refs yield undefined plus a warning. */
  resolve(node: Json, uri: string): Located | undefined {
    let current: Located = { value: node, uri }
    const seen = new Set<string>()
    while (isObject(current.value) && typeof current.value.$ref === 'string') {
      const ref = current.value.$ref
      let target: { uri: string; pointer: string }
      try { target = splitRef(ref, current.uri) } catch { this.warnings.add(`Reference "${ref}" is not a valid URI.`); return undefined }
      const key = `${target.uri}#${target.pointer}`
      if (seen.has(key)) {
        this.warnings.add(`Reference "${ref}" points to itself and was left unresolved.`)
        return undefined
      }
      seen.add(key)
      const document = this.set.documents.get(target.uri)
      if (document === undefined) {
        this.warnings.add(`Reference "${ref}" could not be resolved (document not loaded).`)
        return undefined
      }
      const value = readPointer(document, target.pointer)
      if (value === undefined) {
        this.warnings.add(`Reference "${ref}" could not be resolved in ${displayUri(target.uri)}.`)
        return undefined
      }
      current = { value, uri: target.uri }
    }
    return current
  }

  /**
   * Deep copy with every $ref replaced. A reference already being expanded on
   * the current path is recursive: it is kept as { $ref, "x-circular": true }
   * instead of expanding forever. `maxDepth` bounds pathological nesting.
   */
  deref(node: Json, uri: string, maxDepth = 64, maxNodes = 50_000, selfPointer?: string): Json {
    let budget = maxNodes
    const walk = (value: Json, base: string, stack: string[], depth: number): Json => {
      if (!value || typeof value !== 'object') return value
      if (depth > maxDepth || --budget < 0) {
        this.warnings.add('A deeply nested or very large definition was truncated.')
        return {}
      }
      if (Array.isArray(value)) return value.map(item => walk(item, base, stack, depth + 1))
      const record = value as Record<string, Json>
      if (typeof record.$ref === 'string') {
        let key: string
        try {
          const target = splitRef(record.$ref, base)
          key = `${target.uri}#${target.pointer}`
        } catch {
          this.warnings.add(`Reference "${record.$ref}" is not a valid URI.`)
          return { $ref: record.$ref }
        }
        if (stack.includes(key)) {
          this.warnings.add(`Recursive reference "${record.$ref}" was kept as a reference.`)
          return { $ref: record.$ref, 'x-circular': true }
        }
        const resolved = this.resolve(value, base)
        if (!resolved) return { $ref: record.$ref, 'x-unresolved': true }
        const expanded = walk(resolved.value, resolved.uri, [...stack, key], depth + 1)
        // OpenAPI 3.1 allows siblings next to $ref; they override the target.
        const siblings = Object.entries(value).filter(([name]) => name !== '$ref')
        if (!siblings.length || !isObject(expanded)) return expanded
        return { ...expanded, ...Object.fromEntries(siblings.map(([name, item]) => [name, walk(item, base, stack, depth + 1)])) }
      }
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, walk(item, base, stack, depth + 1)]))
    }
    return walk(node, uri, selfPointer === undefined ? [] : [`${uri}#${selfPointer}`], 0)
  }
}
