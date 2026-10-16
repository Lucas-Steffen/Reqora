/**
 * Serializable workspace model. Everything here crosses the IPC boundary and is
 * persisted as JSON, so it must stay plain data (no classes, functions, Dates).
 */
import type { SearchKind } from '../search/types'

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export interface KeyValue {
  key: string
  value: string
  enabled: boolean
  description?: string
}

export type BodyMode = 'none' | 'json' | 'text' | 'xml' | 'form-urlencoded' | 'form-data'

export interface RequestBody {
  mode: BodyMode
  /** Raw text for json/text/xml modes. */
  raw?: string
  /** Fields for form modes. */
  form?: KeyValue[]
  /** Content type declared by an imported spec. */
  contentType?: string
}

export interface ResponseSpec {
  status: string
  description?: string
  contentType?: string
  /** Pretty-printed example or generated sample. */
  example?: string
}

/** Link from an imported item to the document it came from. */
export interface SourceLink {
  sourceId: string
  /** Stable identity inside the source: "folder:<path>" or "<METHOD> <path>". */
  key: string
}

export interface Folder {
  id: string
  name: string
  /** Undefined means the project root. */
  parentId?: string
  description?: string
  source?: SourceLink
}

export interface Endpoint {
  id: string
  folderId?: string
  name: string
  method: HttpMethod
  /** Path template, e.g. /pets/{petId}. */
  path: string
  description?: string
  tags: string[]
  status?: string
  maintainer?: string
  creator?: string
  latestEditor?: string
  operationId?: string
  query: KeyValue[]
  headers: KeyValue[]
  pathParams: KeyValue[]
  cookies: KeyValue[]
  body: RequestBody
  responses: ResponseSpec[]
  /** Raw OpenAPI security requirement names, kept for the authentication feature. */
  security?: string[][]
  source?: SourceLink
}

/** Non-endpoint resources: schemas, docs, test cases and saved responses. */
export interface Resource {
  id: string
  kind: Exclude<SearchKind, 'api' | 'folder'>
  folderId?: string
  name: string
  description?: string
  tags?: string[]
  content?: string
  source?: SourceLink
}

export type ImportGrouping = 'tags' | 'paths'

export interface ImportSource {
  id: string
  kind: 'file' | 'url'
  /** File name or credential-free URL. Never contains a local directory or secrets. */
  location: string
  title: string
  version?: string
  specVersion: string
  grouping: ImportGrouping
  importedAt: string
}

/**
 * A variable in an environment or the project's globals. Secret values are
 * never stored in the workspace file: the main process moves them into the
 * encrypted secret store on save and blanks `value`.
 */
export interface Variable {
  id: string
  key: string
  value: string
  secret: boolean
  enabled: boolean
  description?: string
  /** Set by the main process on load: an encrypted value exists for this secret. */
  hasStoredSecret?: boolean
  /** Transient: copy the encrypted value of another variable (environment duplication). */
  copySecretFrom?: string
}

export interface Environment {
  id: string
  name: string
  /** Prepended to relative endpoint paths. May contain {{variables}}. */
  baseUrl: string
  variables: Variable[]
}

export interface Project {
  id: string
  name: string
  description?: string
  folders: Folder[]
  endpoints: Endpoint[]
  resources: Resource[]
  importSources: ImportSource[]
  environments: Environment[]
  /** null = "No environment". */
  activeEnvironmentId: string | null
  /** Project-wide variables; environment variables take precedence. */
  globals: Variable[]
  /** Raw securitySchemes / securityDefinitions per source, mapped by the auth feature. */
  importedSecuritySchemes?: Record<string, Record<string, unknown>>
}

export interface Workspace {
  version: 1
  /** Monotonic revision, incremented by the store on every successful save. */
  revision: number
  activeProjectId: string
  projects: Project[]
}

export function activeProject(workspace: Workspace): Project {
  return workspace.projects.find(project => project.id === workspace.activeProjectId) ?? workspace.projects[0]
}

export function replaceProject(workspace: Workspace, project: Project): Workspace {
  return { ...workspace, projects: workspace.projects.map(item => item.id === project.id ? project : item) }
}
