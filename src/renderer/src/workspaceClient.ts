import { useCallback, useEffect, useRef, useState } from 'react'
import { createMemoryWorkspaceRepository, StaleRevisionError, type WorkspaceRepository } from '../../workspace/repository'
import type { Workspace } from '../../workspace/types'
import type { ReqoraApi } from '../../shared/api'

/** Adapts the preload API to the replaceable repository interface. */
export function createIpcWorkspaceRepository(api: ReqoraApi): WorkspaceRepository {
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

export function defaultWorkspaceRepository(): WorkspaceRepository {
  return typeof window !== 'undefined' && window.reqora
    ? createIpcWorkspaceRepository(window.reqora)
    : createMemoryWorkspaceRepository()
}

export interface WorkspaceState {
  workspace: Workspace | null
  error: string
  /** Applies a change and persists it. Updates are serialized; the latest saved state wins. */
  update(change: (workspace: Workspace) => Workspace): Promise<Workspace>
  /** Replace local state with a workspace already saved elsewhere (e.g. by the main process). */
  replace(workspace: Workspace): void
}

export function useWorkspace(repository: WorkspaceRepository): WorkspaceState {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const latest = useRef<Workspace | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    let disposed = false
    repository.load().then(loaded => {
      if (disposed) return
      latest.current = loaded
      setWorkspace(loaded)
    }).catch(() => { if (!disposed) setError('The workspace could not be loaded. Please restart Reqora.') })
    return () => { disposed = true }
  }, [repository])

  const update = useCallback((change: (workspace: Workspace) => Workspace) => {
    const run = queue.current.then(async () => {
      if (!latest.current) throw new Error('The workspace is still loading.')
      const optimistic = change(latest.current)
      setWorkspace(optimistic)
      try {
        const saved = await repository.save(optimistic)
        latest.current = saved
        setWorkspace(saved)
        setError('')
        return saved
      } catch (reason) {
        setWorkspace(latest.current)
        const message = reason instanceof Error ? reason.message : 'The change could not be saved.'
        setError(message)
        throw reason
      }
    })
    queue.current = run.catch(() => undefined)
    return run
  }, [repository])

  const replace = useCallback((next: Workspace) => {
    latest.current = next
    setWorkspace(next)
  }, [])

  return { workspace, error, update, replace }
}
