import type { Endpoint, Folder, ImportGrouping, ImportSource, KeyValue, Project, Resource } from '../workspace/types'
import type { ImportedOperation, ImportedSpec } from './convert'

export type ImportMode = 'merge' | 'overwrite'

export interface ImportOrigin {
  kind: ImportSource['kind']
  /** Credential-free URL or bare file name. */
  location: string
}

export interface PlanOptions {
  grouping: ImportGrouping
  mode: ImportMode
  /** Remove this source's endpoints and schemas that are missing from the new document (Apidog: off by default). */
  deleteUnmatched?: boolean
  /** ISO timestamp, injected for deterministic tests. */
  now: string
}

export interface PlanRow {
  id: string
  method: string
  path: string
  name: string
  folder: string
  change: 'added' | 'updated' | 'unchanged' | 'removed' | 'retained'
}

export interface ImportPlan {
  source: ImportSource
  /** True when this document location was imported before; the mode decides how it is applied. */
  isReimport: boolean
  mode: ImportMode
  counts: { endpoints: number; folders: number; schemas: number; added: number; updated: number; unchanged: number; removed: number; retained: number }
  rows: PlanRow[]
  warnings: string[]
  /** The project after the import is committed. Unchanged until the user confirms. */
  project: Project
}

/** 32-bit FNV-1a, base36. Deterministic IDs make re-imports match the same items. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

export function sourceIdFor(origin: ImportOrigin): string {
  return `src_${stableHash(`${origin.kind}:${origin.location.toLowerCase()}`)}`
}

function folderSegments(operation: ImportedOperation, grouping: ImportGrouping): string[] {
  if (grouping === 'tags') {
    const tag = operation.tags[0]
    // A slash in the first tag creates nested folders ("Store/Orders").
    return tag ? tag.split('/').map(part => part.trim()).filter(Boolean) : []
  }
  const first = operation.path.split('/').find(segment => segment && !segment.startsWith('{'))
  return first ? [first] : []
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function params(operation: ImportedOperation, location: 'query' | 'header' | 'path' | 'cookie'): KeyValue[] {
  return operation.parameters.filter(parameter => parameter.in === location).map(parameter => ({
    key: parameter.name,
    value: parameter.example ?? '',
    enabled: parameter.required || parameter.example !== undefined,
    ...(parameter.description ? { description: parameter.description } : {})
  }))
}

/** Spec-derived fields only. User-owned fields (status, maintainer, later auth/scripts) are not set here. */
function specFields(operation: ImportedOperation, spec: ImportedSpec) {
  return {
    // Apidog's default order: summary, operationId, first description line, path; capped at 255.
    name: (operation.summary ?? operation.operationId ?? operation.description?.split('\n')[0].trim() ?? operation.path).slice(0, 255),
    method: operation.method,
    path: operation.path,
    description: operation.description,
    tags: operation.tags,
    operationId: operation.operationId,
    query: params(operation, 'query'),
    headers: params(operation, 'header'),
    pathParams: params(operation, 'path'),
    cookies: params(operation, 'cookie'),
    body: operation.body,
    responses: operation.responses,
    security: operation.security ?? (spec.security.length ? spec.security : undefined)
  }
}

/**
 * Builds a preview and the resulting project, without side effects.
 *
 * - A new location is added as a new source; existing items are untouched.
 * - merge: matched (method + path) endpoints get updated spec fields but keep
 *   their ID and user-owned fields (status, maintainer, auth, scripts).
 * - overwrite: matched endpoints are replaced by the document's version (only the ID is kept).
 * - deleteUnmatched: the source's items missing from the new document are removed;
 *   otherwise they are retained. Folders still holding retained or manual items are kept.
 * Other sources and manually created items are never modified.
 */
export function planImport(project: Project, spec: ImportedSpec, origin: ImportOrigin, options: PlanOptions): ImportPlan {
  const sourceId = sourceIdFor(origin)
  const previous = project.importSources.find(source => source.id === sourceId)
  const isReimport = !!previous
  const source: ImportSource = {
    id: sourceId,
    kind: origin.kind,
    location: origin.location,
    title: spec.title,
    version: spec.version,
    specVersion: `${spec.kind === 'swagger2' ? 'Swagger' : 'OpenAPI'} ${spec.specVersion}`,
    grouping: options.grouping,
    importedAt: options.now
  }
  const fromSource = <T extends { source?: { sourceId: string } }>(item: T) => item.source?.sourceId === sourceId

  // Folders for the new document.
  const tagDescriptions = new Map(spec.tags.map(tag => [tag.name, tag.description]))
  const newFolders = new Map<string, Folder>()
  const folderIdFor = (segments: string[]): string | undefined => {
    let parentId: string | undefined
    for (let depth = 0; depth < segments.length; depth++) {
      const key = `folder:${segments.slice(0, depth + 1).join('/')}`
      const id = `fld_${stableHash(`${sourceId}|${key}`)}`
      if (!newFolders.has(key)) {
        newFolders.set(key, {
          id,
          name: segments[depth],
          parentId,
          description: depth === segments.length - 1 ? tagDescriptions.get(segments.join('/')) : undefined,
          source: { sourceId, key }
        })
      }
      folderLabels.set(id, segments.slice(0, depth + 1).join(' / '))
      parentId = id
    }
    return parentId
  }

  const existingByKey = new Map(project.endpoints.filter(fromSource).map(endpoint => [endpoint.source!.key, endpoint]))
  const rows: PlanRow[] = []
  const nextSourceEndpoints: Endpoint[] = []
  const seenKeys = new Set<string>()
  const folderLabels = new Map<string, string>()
  const folderName = (folderId?: string) => (folderId && folderLabels.get(folderId)) || 'Project root'

  for (const operation of spec.operations) {
    const key = `${operation.method} ${operation.path}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    const folderId = folderIdFor(folderSegments(operation, options.grouping))
    const fields = specFields(operation, spec)
    const existing = existingByKey.get(key)
    const id = existing?.id ?? `ep_${stableHash(`${sourceId}|${key}`)}`
    const endpoint: Endpoint = options.mode === 'merge' && existing
      ? { ...existing, ...fields, folderId, source: { sourceId, key } }
      : { id, folderId, ...fields, ...(operation.deprecated ? { status: 'Deprecated' } : {}), source: { sourceId, key } }
    const cleaned = Object.fromEntries(Object.entries(endpoint).filter(([, value]) => value !== undefined)) as unknown as Endpoint
    nextSourceEndpoints.push(cleaned)
    const change: PlanRow['change'] = !existing ? 'added' : sameJson(stripSource(existing), stripSource(cleaned)) ? 'unchanged' : 'updated'
    rows.push({ id, method: operation.method, path: operation.path, name: cleaned.name, folder: folderName(folderId), change })
  }

  const missing = [...existingByKey.values()].filter(endpoint => !seenKeys.has(endpoint.source!.key))
  for (const endpoint of missing) {
    rows.push({ id: endpoint.id, method: endpoint.method, path: endpoint.path, name: endpoint.name, folder: '', change: options.deleteUnmatched ? 'removed' : 'retained' })
  }

  // Schemas live in a "Schemas" folder for the source.
  const schemaFolder = spec.schemas.length ? folderIdFor(['Schemas']) : undefined
  const nextSourceResources: Resource[] = spec.schemas.map(schema => ({
    id: `sch_${stableHash(`${sourceId}|schema:${schema.name}`)}`,
    kind: 'schema',
    folderId: schemaFolder,
    name: schema.name,
    ...(schema.description ? { description: schema.description } : {}),
    content: schema.content,
    source: { sourceId, key: `schema:${schema.name}` }
  }))

  // Retained items keep their old folders.
  const retainedEndpoints = options.deleteUnmatched ? [] : missing
  const newSchemaKeys = new Set(nextSourceResources.map(resource => resource.source!.key))
  const retainedResources = options.deleteUnmatched
    ? []
    : project.resources.filter(resource => fromSource(resource) && !newSchemaKeys.has(resource.source!.key))
  const manualItems = [...project.endpoints.filter(item => !fromSource(item)), ...project.resources.filter(item => !fromSource(item))]
  const newFolderIds = new Set([...newFolders.values()].map(folder => folder.id))
  const oldSourceFolders = project.folders.filter(fromSource)
  const neededOld = new Set<string>()
  const markNeeded = (folderId?: string) => {
    let current = oldSourceFolders.find(folder => folder.id === folderId)
    while (current && !neededOld.has(current.id)) {
      neededOld.add(current.id)
      current = oldSourceFolders.find(folder => folder.id === current!.parentId)
    }
  }
  for (const item of [...retainedEndpoints, ...retainedResources, ...manualItems]) markNeeded(item.folderId)
  for (const folder of project.folders) if (!fromSource(folder)) markNeeded(folder.parentId)
  const keptOldFolders = oldSourceFolders.filter(folder => neededOld.has(folder.id) && !newFolderIds.has(folder.id))

  const nextProject: Project = {
    ...project,
    folders: [...project.folders.filter(folder => !fromSource(folder)), ...keptOldFolders, ...newFolders.values()],
    endpoints: [...project.endpoints.filter(item => !fromSource(item)), ...retainedEndpoints, ...nextSourceEndpoints],
    resources: [...project.resources.filter(item => !fromSource(item)), ...retainedResources, ...nextSourceResources],
    importSources: previous
      ? project.importSources.map(item => item.id === sourceId ? source : item)
      : [...project.importSources, source],
    importedSecuritySchemes: { ...project.importedSecuritySchemes, [sourceId]: spec.securitySchemes }
  }
  if (!Object.keys(spec.securitySchemes).length) delete nextProject.importedSecuritySchemes![sourceId]

  const count = (change: PlanRow['change']) => rows.filter(row => row.change === change).length
  return {
    source,
    isReimport,
    mode: options.mode,
    counts: {
      endpoints: nextSourceEndpoints.length,
      folders: newFolders.size,
      schemas: nextSourceResources.length,
      added: count('added'),
      updated: count('updated'),
      unchanged: count('unchanged'),
      removed: count('removed'),
      retained: count('retained')
    },
    rows,
    warnings: spec.warnings,
    project: nextProject
  }
}

function stripSource(endpoint: Endpoint): Omit<Endpoint, 'source' | 'id'> {
  const { source: _source, id: _id, ...rest } = endpoint
  return rest
}
