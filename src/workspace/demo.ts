import { demoRecords } from '../search/demo'
import type { Endpoint, HttpMethod, Project, Resource, Workspace } from './types'

/** Builds the original synthetic Commerce API project from the search fixtures. */
export function createDemoProject(): Project {
  const root = demoRecords.find(record => !record.parentId)!
  const folderId = (parentId?: string) => parentId === root.id ? undefined : parentId
  const endpoints: Endpoint[] = demoRecords.filter(record => record.kind === 'api').map(record => ({
    id: record.id,
    folderId: folderId(record.parentId),
    name: record.name,
    method: (record.method ?? 'GET') as HttpMethod,
    path: record.path ?? '/',
    description: record.description,
    tags: record.tags ?? [],
    status: record.status,
    maintainer: record.maintainer,
    creator: record.creator,
    latestEditor: record.latestEditor,
    query: [], headers: [], pathParams: [], cookies: [],
    body: record.method === 'POST' && record.content ? { mode: 'json', raw: record.content } : { mode: 'none' },
    responses: record.method !== 'POST' && record.content ? [{ status: '200', contentType: 'application/json', example: record.content }] : []
  }))
  const resources: Resource[] = demoRecords
    .filter(record => record.kind !== 'api' && record.kind !== 'folder')
    .map(record => ({
      id: record.id, kind: record.kind as Resource['kind'], folderId: folderId(record.parentId), name: record.name,
      description: record.description, tags: record.tags, content: record.content
    }))
  return {
    id: root.id,
    name: root.name,
    description: root.description,
    folders: demoRecords.filter(record => record.kind === 'folder' && record.parentId)
      .map(record => ({ id: record.id, name: record.name, parentId: folderId(record.parentId), description: record.description })),
    endpoints,
    resources,
    importSources: [],
    // Synthetic environments on reserved .test hosts; nothing real is contacted.
    environments: [
      { id: 'env_local', name: 'Local', baseUrl: 'http://127.0.0.1:4010', variables: [
        { id: 'var_local_user', key: 'userId', value: 'usr_01', secret: false, enabled: true }
      ] },
      { id: 'env_staging', name: 'Staging', baseUrl: 'https://staging.commerce.test', variables: [
        { id: 'var_staging_user', key: 'userId', value: 'usr_staging', secret: false, enabled: true }
      ] },
      { id: 'env_production', name: 'Production', baseUrl: 'https://api.commerce.test', variables: [] }
    ],
    activeEnvironmentId: 'env_local',
    globals: [
      { id: 'var_global_page', key: 'pageSize', value: '20', secret: false, enabled: true, description: 'Default page size' }
    ]
  }
}

export function createDemoWorkspace(): Workspace {
  const project = createDemoProject()
  return { version: 1, revision: 0, activeProjectId: project.id, projects: [project] }
}
