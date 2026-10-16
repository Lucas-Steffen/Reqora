import { activeEnvironment } from '../environments/variables'
import type { Endpoint, Project } from '../workspace/types'

export type BaseUrlOrigin = 'absolute' | 'environment-service' | 'endpoint-server' | 'source-server' | 'environment' | 'none'

export interface ResolvedBaseUrl {
  /** May still contain {{variables}}; undefined when nothing applies or the URL is absolute. */
  baseUrl?: string
  origin: BaseUrlOrigin
  /** Human-readable explanation for the Request tab. */
  label: string
}

/**
 * Base URL for an endpoint, highest precedence first:
 * 1. absolute URL or one starting with {{ → nothing is prepended
 * 2. active environment's service URL for the endpoint's import source
 * 3. the endpoint's own OpenAPI servers, then its import source's servers
 * 4. active environment's base URL (manual endpoints)
 * Mirrors Apidog's per-service base URLs, with each import source as a service.
 */
export function resolveBaseUrl(project: Project, endpoint: Pick<Endpoint, 'source' | 'servers'>, url: string): ResolvedBaseUrl {
  if (/^https?:\/\//i.test(url) || url.trimStart().startsWith('{{')) {
    return { origin: 'absolute', label: 'Absolute URL: no base URL is added.' }
  }
  const environment = activeEnvironment(project)
  const sourceId = endpoint.source?.sourceId
  const source = sourceId ? project.importSources.find(item => item.id === sourceId) : undefined
  const serviceUrl = sourceId ? environment?.serviceUrls?.[sourceId]?.trim() : undefined
  if (environment && serviceUrl) {
    return { baseUrl: serviceUrl, origin: 'environment-service', label: `${environment.name} → ${source?.title ?? 'imported API'}` }
  }
  if (endpoint.servers?.[0]) return { baseUrl: endpoint.servers[0], origin: 'endpoint-server', label: 'Server declared on this operation' }
  if (source?.servers?.[0]) return { baseUrl: source.servers[0], origin: 'source-server', label: `Server from ${source.title}` }
  if (environment?.baseUrl.trim()) return { baseUrl: environment.baseUrl.trim(), origin: 'environment', label: environment.name }
  return {
    origin: 'none',
    label: environment
      ? `${environment.name} has no base URL. Set one in Environments or use an absolute URL.`
      : 'No environment selected and no server in the imported document. Choose an environment or use an absolute URL.'
  }
}
