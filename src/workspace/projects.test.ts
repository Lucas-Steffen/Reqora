// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createDemoWorkspace } from './demo'
import { addProject, compositeKey, createEmptyProject, createProject, deleteProject, duplicateProject, renameProject, setActiveProject, splitCompositeKey } from './projects'
import { isWorkspace, normalizeWorkspace } from './repository'
import { toSearchRecords } from './records'
import type { Workspace } from './types'

describe('project operations', () => {
  it('has no limit on the number of projects and keeps names unique', () => {
    let workspace = createDemoWorkspace()
    for (let i = 0; i < 250; i++) workspace = createProject(workspace, 'Imported API').workspace
    expect(workspace.projects).toHaveLength(251)
    expect(new Set(workspace.projects.map(project => project.name)).size).toBe(251)
    expect(new Set(workspace.projects.map(project => project.id)).size).toBe(251)
    expect(workspace.projects.at(-1)!.name).toBe('Imported API 250')
    expect(workspace.activeProjectId).toBe(workspace.projects.at(-1)!.id)
  })

  it('renames (ignoring blanks) and switches only to existing projects', () => {
    const workspace = createDemoWorkspace()
    expect(renameProject(workspace, 'commerce', '  ').projects[0].name).toBe('Commerce API')
    expect(renameProject(workspace, 'commerce', ' Shop ').projects[0].name).toBe('Shop')
    expect(setActiveProject(workspace, 'nope')).toBe(workspace)
  })

  it('duplicates deeply: new project and variable IDs, secrets marked for copying, other IDs kept', () => {
    const base = createDemoWorkspace()
    base.projects[0].environments[0].variables.push({ id: 'v_secret', key: 'token', value: '', secret: true, enabled: true, hasStoredSecret: true })
    const { workspace, project } = duplicateProject(base, 'commerce')
    expect(workspace.projects.map(item => item.name)).toEqual(['Commerce API', 'Commerce API copy'])
    expect(workspace.activeProjectId).toBe(project!.id)
    expect(project!.id).not.toBe('commerce')
    expect(project!.endpoints.map(endpoint => endpoint.id)).toEqual(base.projects[0].endpoints.map(endpoint => endpoint.id))
    const copied = project!.environments[0].variables
    expect(copied.every(variable => !base.projects[0].environments[0].variables.some(original => original.id === variable.id))).toBe(true)
    expect(copied.at(-1)).toMatchObject({ key: 'token', value: '', secret: true, copySecretFrom: 'v_secret' })
    expect(copied.at(-1)).not.toHaveProperty('hasStoredSecret')
    // The copy is independent.
    project!.endpoints[0].name = 'Changed'
    expect(base.projects[0].endpoints[0].name).toBe('List users')
  })

  it('deletes, moving the active project to a neighbour, and never leaves zero projects', () => {
    const two = createProject(createDemoWorkspace(), 'Second').workspace
    const afterDelete = deleteProject(two, two.activeProjectId)
    expect(afterDelete.projects.map(project => project.name)).toEqual(['Commerce API'])
    expect(afterDelete.activeProjectId).toBe('commerce')
    const empty = deleteProject(afterDelete, 'commerce')
    expect(empty.projects).toHaveLength(1)
    expect(empty.projects[0]).toMatchObject({ name: 'My project', endpoints: [] })
    expect(empty.activeProjectId).toBe(empty.projects[0].id)
  })

  it('isolates projects: the same document imported twice gets independent copies', () => {
    const workspace = addProject(createDemoWorkspace(), { ...createEmptyProject('Other'), endpoints: structuredClone(createDemoWorkspace().projects[0].endpoints) })
    workspace.projects[1].endpoints[0].name = 'Only in Other'
    expect(workspace.projects[0].endpoints[0].name).toBe('List users')
    expect(toSearchRecords(workspace.projects[0]).some(record => record.name === 'Only in Other')).toBe(false)
  })

  it('round-trips composite keys used by cross-project search', () => {
    expect(splitCompositeKey(compositeKey('prj_1', 'ep::x'))).toEqual({ projectId: 'prj_1', id: 'ep::x' })
    expect(splitCompositeKey('plain')).toBeUndefined()
  })
})

describe('migration from the single-project format (v1)', () => {
  it('accepts a v1 file without environments/globals and migrates it to v2 without losing data', () => {
    const demo = createDemoWorkspace()
    const v1 = JSON.parse(JSON.stringify({ ...demo, version: 1, revision: 7, projects: demo.projects.map(({ environments: _e, globals: _g, activeEnvironmentId: _a, ...rest }) => rest) }))
    expect(isWorkspace(v1)).toBe(true)
    const migrated = normalizeWorkspace(v1 as Workspace)
    expect(migrated).toMatchObject({ version: 2, revision: 7, activeProjectId: 'commerce' })
    expect(migrated.projects[0]).toMatchObject({ environments: [], globals: [], activeEnvironmentId: null })
    expect(migrated.projects[0].endpoints).toEqual(demo.projects[0].endpoints)
    expect(migrated.projects[0].folders).toEqual(demo.projects[0].folders)
    expect(migrated.projects[0].resources).toEqual(demo.projects[0].resources)
  })

  it('repairs a dangling active project ID', () => {
    expect(normalizeWorkspace({ ...createDemoWorkspace(), activeProjectId: 'gone' }).activeProjectId).toBe('commerce')
  })
})
