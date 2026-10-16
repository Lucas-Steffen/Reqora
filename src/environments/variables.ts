import type { Environment, Project, Variable } from '../workspace/types'

/**
 * Variable scopes, highest precedence first. A key found in an earlier scope
 * wins. This is the subset of Apidog's order that Reqora has:
 *   local (set by a script during this run) > environment > global.
 * (Apidog also has test data, module, team and vault layers in between.)
 */
export const SCOPE_ORDER = ['local', 'environment', 'global'] as const
export type VariableScope = (typeof SCOPE_ORDER)[number]

export interface ScopeValues {
  local: Map<string, string>
  environment: Map<string, string>
  global: Map<string, string>
}

/** Keys whose values must never be shown or logged. */
export interface ResolutionContext {
  scopes: ScopeValues
  secretValues: string[]
}

export function emptyScopes(): ScopeValues {
  return { local: new Map(), environment: new Map(), global: new Map() }
}

export function activeEnvironment(project: Project): Environment | undefined {
  return project.environments?.find(environment => environment.id === project.activeEnvironmentId)
}

/**
 * Builds scope maps from enabled variables. `secretLookup` returns decrypted
 * secret values (only available in the main process); without it, secret
 * variables resolve to nothing and are reported as unresolved.
 */
export function buildContext(project: Project, secretLookup?: (variable: Variable) => string | undefined): ResolutionContext {
  const scopes = emptyScopes()
  const secretValues: string[] = []
  const fill = (target: Map<string, string>, variables: Variable[] = []) => {
    for (const variable of variables) {
      if (!variable.enabled || !variable.key.trim()) continue
      const value = variable.secret ? secretLookup?.(variable) : variable.value
      if (value === undefined) continue
      if (variable.secret && value) secretValues.push(value)
      // First enabled definition of a key in a scope wins.
      if (!target.has(variable.key.trim())) target.set(variable.key.trim(), value)
    }
  }
  fill(scopes.environment, activeEnvironment(project)?.variables)
  fill(scopes.global, project.globals)
  return { scopes, secretValues }
}

export function lookup(scopes: ScopeValues, name: string): string | undefined {
  for (const scope of SCOPE_ORDER) {
    const value = scopes[scope].get(name)
    if (value !== undefined) return value
  }
  // Path access into JSON values: {{user.id}}, {{items[0].name}}.
  const match = /^([^.[\]]+)((?:\.[^.[\]]+|\[\d+\])+)$/.exec(name)
  if (!match) return undefined
  const root = lookup(scopes, match[1])
  if (root === undefined) return undefined
  let current: unknown
  try { current = JSON.parse(root) } catch { return undefined }
  for (const part of match[2].match(/\.[^.[\]]+|\[\d+\]/g) ?? []) {
    const key = part.startsWith('.') ? part.slice(1) : Number(part.slice(1, -1))
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[key]
  }
  if (current === undefined) return undefined
  return typeof current === 'string' ? current : JSON.stringify(current)
}

/** Apidog's script-runtime pattern: innermost `{{name}}` without braces inside. */
const TOKEN = /\{\{([^{}]*?)\}\}/g
export const MAX_PASSES = 19

export interface Substitution {
  value: string
  unresolved: string[]
}

/**
 * Replaces `{{name}}` tokens. Resolved values may contain further tokens
 * (nested or recursive variables); passes repeat up to MAX_PASSES. Unresolved
 * tokens stay literally in the text and are reported.
 */
export function substitute(text: string, scopes: ScopeValues): Substitution {
  const unresolved = new Set<string>()
  let current = text
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false
    current = current.replace(TOKEN, (token, raw: string) => {
      const name = raw.trim()
      const value = lookup(scopes, name)
      if (value === undefined) {
        unresolved.add(name)
        return token
      }
      changed = true
      return value
    })
    if (!changed) break
  }
  // Report only names still present after the final pass.
  const remaining = new Set([...current.matchAll(TOKEN)].map(match => match[1].trim()))
  return { value: current, unresolved: [...unresolved].filter(name => remaining.has(name)) }
}

/** Replaces each secret value with a mask; used for anything shown or logged. */
export function redact(text: string, secretValues: readonly string[]): string {
  let result = text
  for (const secret of [...secretValues].sort((a, b) => b.length - a.length)) {
    if (secret.length < 1) continue
    result = result.split(secret).join('••••••')
  }
  return result
}

export function newId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14)
  return `${prefix}_${random}`
}
