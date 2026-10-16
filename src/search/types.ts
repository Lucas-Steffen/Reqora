/** Serializable boundary: a future IPC adapter can implement SearchRepository. */
export type SearchKind = 'api' | 'folder' | 'schema' | 'doc' | 'case' | 'response'
export type SearchField = 'name' | 'path' | 'tags' | 'id' | 'folder'

export interface SearchRecord {
  id: string
  kind: SearchKind
  name: string
  parentId?: string
  path?: string
  description?: string
  method?: string
  breadcrumbs: string[]
  tags?: string[]
  content?: string
  status?: string
  maintainer?: string
  creator?: string
  latestEditor?: string
}

export interface SearchMetadataFilter {
  key: 'status' | 'tags' | 'maintainer' | 'creator' | 'latestEditor'
  values: string[]
  exclude?: boolean
}

export interface SearchOptions {
  fields: SearchField[]
  kinds: SearchKind[]
  filters?: SearchMetadataFilter[]
}

export interface SearchMatch {
  field: SearchField
  /** Half-open UTF-16 offsets into the displayed field. */
  start: number
  end: number
}

export interface SearchResult {
  record: SearchRecord
  matches: SearchMatch[]
  /** Root-to-parent record IDs, for revealing a hit in the workspace tree. */
  ancestors: string[]
}

export interface SearchRepository {
  getAll(): Promise<SearchRecord[]>
  search(query: string, options: SearchOptions, signal?: AbortSignal): Promise<SearchResult[]>
}

export const SEARCH_FIELDS: { value: SearchField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'path', label: 'URL path' },
  { value: 'tags', label: 'Tags' },
  { value: 'id', label: 'ID' },
  { value: 'folder', label: 'Folder names' }
]

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  fields: ['name', 'path', 'tags', 'id', 'folder'],
  kinds: ['api', 'folder', 'schema', 'doc', 'case', 'response']
}
