import type { SearchRecord } from '../search/types'
import type { Endpoint, Folder, Project } from './types'

/** Folder chain from the root to `folderId`, inclusive. Cycles are cut. */
export function folderChain(project: Project, folderId: string | undefined): Folder[] {
  const byId = new Map(project.folders.map(folder => [folder.id, folder]))
  const chain: Folder[] = []
  const seen = new Set<string>()
  let current = folderId ? byId.get(folderId) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

export function endpointContent(endpoint: Endpoint): string | undefined {
  return endpoint.responses.find(response => response.example)?.example ?? (endpoint.body.raw || undefined)
}

/**
 * Projects the workspace into the pure search module's record shape, in tree
 * order (folder, its endpoints, its resources, then subfolders). The project
 * itself is the root folder record. Only explicit fields are copied; scripts,
 * auth and variables never enter the search index.
 */
export function toSearchRecords(project: Project): SearchRecord[] {
  const records: SearchRecord[] = [{
    id: project.id, kind: 'folder', name: project.name, breadcrumbs: [], description: project.description
  }]
  const crumbs = (folderId?: string) => [project.name, ...folderChain(project, folderId).map(folder => folder.name)]
  const visited = new Set<string>()
  const emitChildren = (folderId: string | undefined) => {
    const parentId = folderId ?? project.id
    for (const endpoint of project.endpoints.filter(item => item.folderId === folderId)) {
      records.push({
        id: endpoint.id, kind: 'api', parentId, name: endpoint.name, method: endpoint.method, path: endpoint.path,
        breadcrumbs: crumbs(folderId), tags: endpoint.tags, description: endpoint.description, content: endpointContent(endpoint),
        status: endpoint.status, maintainer: endpoint.maintainer, creator: endpoint.creator, latestEditor: endpoint.latestEditor
      })
    }
    for (const resource of project.resources.filter(item => item.folderId === folderId)) {
      records.push({
        id: resource.id, kind: resource.kind, parentId, name: resource.name, breadcrumbs: crumbs(folderId),
        tags: resource.tags, description: resource.description, content: resource.content
      })
    }
    for (const folder of project.folders.filter(item => item.parentId === folderId)) {
      if (visited.has(folder.id)) continue
      visited.add(folder.id)
      records.push({ id: folder.id, kind: 'folder', parentId, name: folder.name, breadcrumbs: crumbs(folderId), description: folder.description })
      emitChildren(folder.id)
    }
  }
  emitChildren(undefined)
  return records.map(record => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as unknown as SearchRecord)
}
