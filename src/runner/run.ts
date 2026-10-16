import { activeEnvironment, buildContext, redact } from '../environments/variables'
import { activeProject, type Project, type Variable, type Workspace } from '../workspace/types'
import { draftFromEndpoint, prepareRequest, type PreparedRequest, type RequestDraft } from './prepare'

export interface HttpResponseView {
  status: number
  statusText: string
  headers: [string, string][]
  body: string
  truncated: boolean
  sizeBytes: number
  timeMs: number
  url: string
}

export interface RunInput {
  endpointId: string
  /** Unsaved edits from the request editor; defaults to the stored endpoint. */
  draft?: RequestDraft
}

export interface RunResult {
  ok: boolean
  /** What was sent, with secret values masked. */
  request?: { method: string; url: string; headers: [string, string][]; body?: string }
  response?: HttpResponseView
  error?: string
  unresolved: string[]
}

export interface RunDependencies {
  workspace: Workspace
  /** Decrypts a secret variable's value (main process only). */
  readSecret(variable: Variable): Promise<string | undefined>
  send(request: PreparedRequest): Promise<HttpResponseView>
}

async function secretValues(project: Project, readSecret: RunDependencies['readSecret']): Promise<Map<string, string>> {
  const variables = [...(activeEnvironment(project)?.variables ?? []), ...project.globals].filter(variable => variable.enabled && variable.secret)
  // A secret that cannot be decrypted resolves to nothing and is reported as unresolved.
  const entries = await Promise.all(variables.map(async variable => [variable.id, await readSecret(variable).catch(() => undefined)] as const))
  return new Map(entries.filter((entry): entry is readonly [string, string] => entry[1] !== undefined))
}

function bodyText(request: PreparedRequest): string | undefined {
  if (!request.body) return undefined
  return request.body.kind === 'text' ? request.body.text : request.body.fields.map(([key, value]) => `${key}: ${value}`).join('\n')
}

/** Resolve variables, send, and return a redacted view of the exchange. */
export async function runRequest(input: RunInput, deps: RunDependencies): Promise<RunResult> {
  const project = activeProject(deps.workspace)
  const endpoint = project.endpoints.find(item => item.id === input.endpointId)
  if (!endpoint) return { ok: false, error: 'The endpoint no longer exists.', unresolved: [] }
  const secrets = await secretValues(project, deps.readSecret)
  const context = buildContext(project, variable => secrets.get(variable.id))
  const draft = input.draft ?? draftFromEndpoint(endpoint)
  const prepared = prepareRequest(draft, context.scopes, activeEnvironment(project)?.baseUrl)
  const mask = (text: string) => redact(text, context.secretValues)
  const request = {
    method: prepared.method,
    url: mask(prepared.url),
    headers: prepared.headers.map(([name, value]) => [name, mask(value)] as [string, string]),
    body: bodyText(prepared) === undefined ? undefined : mask(bodyText(prepared)!)
  }
  try {
    const response = await deps.send(prepared)
    return {
      ok: true,
      request,
      response: { ...response, url: mask(response.url), body: mask(response.body), headers: response.headers.map(([name, value]) => [name, mask(value)]) },
      unresolved: prepared.unresolved
    }
  } catch (error) {
    return { ok: false, request, error: mask(error instanceof Error ? error.message : 'The request failed.'), unresolved: prepared.unresolved }
  }
}
