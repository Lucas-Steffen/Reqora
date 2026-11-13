import { useCallback, useEffect, useRef, useState } from 'react'
import { createMemoryWorkspaceRepository, isWorkspace, normalizeWorkspace, StaleRevisionError, type WorkspaceRepository } from '../../workspace/repository'
import type { Workspace } from '../../workspace/types'
import type { ReqoraApi } from '../../shared/api'
import { desktopApi } from './platform'

/** Adapts the preload API to the replaceable repository interface. */
export function createIpcWorkspaceRepository(api: Pick<ReqoraApi, 'workspace'>): WorkspaceRepository {
  return {
    load: () => api.workspace.load(),
    async save(workspace) {
      const outcome = await api.workspace.save(workspace)
      if (outcome.ok) return outcome.workspace
      if (outcome.code === 'STALE') throw new StaleRevisionError()
      throw new Error(outcome.message)
    }
  }
}

/**
 * In-memory repository whose initial workspace is fetched from `url` on first
 * load. Only bench builds use it (VITE_REQORA_BENCH_WORKSPACE), so the Tauri
 * prototype can open the same fixture the Electron baseline opens.
 */
export function createFetchedWorkspaceRepository(url: string, fetcher: typeof fetch = fetch): WorkspaceRepository {
  let inner: Promise<WorkspaceRepository> | undefined
  const ready = () => inner ??= fetcher(url).then(async response => {
    if (!response.ok) throw new Error(`Bench workspace request failed with ${response.status}`)
    const value: unknown = await response.json()
    if (!isWorkspace(value)) throw new Error('Bench workspace is not a workspace')
    return createMemoryWorkspaceRepository(normalizeWorkspace(value))
  })
  return {
    load: async () => (await ready()).load(),
    save: async workspace => (await ready()).save(workspace)
  }
}

export function defaultWorkspaceRepository(): WorkspaceRepository {
  const api = desktopApi()
  if (api?.workspace) return createIpcWorkspaceRepository({ workspace: api.workspace })
  const bench = import.meta.env.VITE_REQORA_BENCH_WORKSPACE
  return bench ? createFetchedWorkspaceRepository(bench) : createMemoryWorkspaceRepository()
}

export interface WorkspaceState {
  workspace: Workspace | null
  error: string
  /**
   * Applies a change to the latest local state immediately and persists it.
   * Saves are serialized and coalesced (each save writes the newest state).
   */
  update(change: (workspace: Workspace) => Workspace): Promise<Workspace>
  /** Replace local state with a workspace already saved elsewhere (e.g. by the main process). */
  replace(workspace: Workspace): void
  /** Resolves when every pending save has finished. */
  flush(): Promise<void>
}

export function useWorkspace(repository: WorkspaceRepository): WorkspaceState {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  /** Last state confirmed by the repository. */
  const saved = useRef<Workspace | null>(null)
  /** Latest local state, including unsaved edits. */
  const view = useRef<Workspace | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    let disposed = false
    repository.load().then(loaded => {
      if (disposed) return
      saved.current = view.current = loaded
      setWorkspace(loaded)
    }).catch(() => { if (!disposed) setError('The workspace could not be loaded. Please restart Reqora.') })
    return () => { disposed = true }
  }, [repository])

  const update = useCallback((change: (workspace: Workspace) => Workspace) => {
    if (!view.current || !saved.current) return Promise.reject(new Error('The workspace is still loading.'))
    view.current = change(view.current)
    setWorkspace(view.current)
    const run = queue.current.then(async () => {
      const source = view.current!
      if (source === saved.current) return saved.current
      try {
        const result = await repository.save({ ...source, revision: saved.current!.revision })
        saved.current = result
        // Adopt the stored form (e.g. blanked secrets) unless newer edits exist.
        if (view.current === source) {
          view.current = result
          setWorkspace(result)
        }
        setError('')
        return result
      } catch (reason) {
        view.current = saved.current
        setWorkspace(saved.current)
        setError(reason instanceof Error ? reason.message : 'The change could not be saved.')
        throw reason
      }
    })
    queue.current = run.catch(() => undefined)
    return run as Promise<Workspace>
  }, [repository])

  const replace = useCallback((next: Workspace) => {
    saved.current = view.current = next
    setWorkspace(next)
  }, [])

  const flush = useCallback(async () => { await queue.current }, [])

  return { workspace, error, update, replace, flush }
}
