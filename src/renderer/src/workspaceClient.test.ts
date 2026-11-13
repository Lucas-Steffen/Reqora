import { describe, expect, it, vi } from 'vitest'
import { createDemoWorkspace } from '../../workspace/demo'
import { createFetchedWorkspaceRepository } from './workspaceClient'

const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('fetched workspace repository (bench builds)', () => {
  it('fetches once and then behaves like the memory repository', async () => {
    const fixture = createDemoWorkspace()
    const fetcher = vi.fn(() => reply(fixture))
    const repository = createFetchedWorkspaceRepository('/bench-workspace.json', fetcher as unknown as typeof fetch)
    const loaded = await repository.load()
    expect(loaded.projects.map(project => project.id)).toEqual(fixture.projects.map(project => project.id))
    const saved = await repository.save(loaded)
    expect(saved.revision).toBe(loaded.revision + 1)
    expect((await repository.load()).revision).toBe(saved.revision)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/bench-workspace.json')
  })

  it('rejects a failed response or a payload that is not a workspace', async () => {
    await expect(createFetchedWorkspaceRepository('/x', (() => reply({}, 404)) as unknown as typeof fetch).load()).rejects.toThrow('404')
    await expect(createFetchedWorkspaceRepository('/x', (() => reply({ version: 2 })) as unknown as typeof fetch).load()).rejects.toThrow('not a workspace')
  })
})
