import { newId } from '../environments/variables'
import type { Project, Variable, Workspace } from './types'

/**
 * Pure project operations. There is deliberately no limit on the number of
 * projects. IDs inside a project are only unique within that project; every
 * lookup is scoped by project.
 */

export function createEmptyProject(name: string, id = newId('prj')): Project {
  return {
    id,
    name,
    folders: [],
    endpoints: [],
    resources: [],
    importSources: [],
    environments: [],
    activeEnvironmentId: null,
    globals: []
  }
}

export function uniqueProjectName(workspace: Workspace, base: string): string {
  const trimmed = base.trim() || 'Untitled project'
  const names = new Set(workspace.projects.map(project => project.name.toLowerCase()))
  if (!names.has(trimmed.toLowerCase())) return trimmed
  for (let index = 2; ; index++) if (!names.has(`${trimmed} ${index}`.toLowerCase())) return `${trimmed} ${index}`
}

export function addProject(workspace: Workspace, project: Project, activate = true): Workspace {
  const named = { ...project, name: uniqueProjectName(workspace, project.name) }
  return { ...workspace, projects: [...workspace.projects, named], activeProjectId: activate ? named.id : workspace.activeProjectId }
}

export function createProject(workspace: Workspace, name = 'New project'): { workspace: Workspace; project: Project } {
  const project = createEmptyProject(uniqueProjectName(workspace, name))
  return { workspace: addProject(workspace, project), project }
}

export function renameProject(workspace: Workspace, id: string, name: string): Workspace {
  const trimmed = name.trim()
  if (!trimmed) return workspace
  return { ...workspace, projects: workspace.projects.map(project => project.id === id ? { ...project, name: trimmed } : project) }
}

/**
 * Deep copy under a new project ID. Variables get new IDs because the secret
 * store is keyed by variable ID; secret values are copied by the main process
 * through `copySecretFrom`. Everything else keeps its IDs, which are scoped to
 * the project, so re-importing a document into the copy is still recognized.
 */
export function duplicateProject(workspace: Workspace, id: string): { workspace: Workspace; project?: Project } {
  const index = workspace.projects.findIndex(project => project.id === id)
  if (index === -1) return { workspace }
  const source = workspace.projects[index]
  const copyVariable = (variable: Variable): Variable => {
    const { hasStoredSecret, copySecretFrom: _ignored, ...rest } = variable
    return {
      ...rest,
      id: newId('var'),
      value: variable.secret ? '' : variable.value,
      ...(variable.secret && hasStoredSecret ? { copySecretFrom: variable.id } : {})
    }
  }
  const project: Project = {
    ...structuredClone(source),
    id: newId('prj'),
    name: uniqueProjectName(workspace, `${source.name} copy`),
    globals: source.globals.map(copyVariable),
    environments: source.environments.map(environment => ({ ...structuredClone(environment), variables: environment.variables.map(copyVariable) }))
  }
  const projects = [...workspace.projects]
  projects.splice(index + 1, 0, project)
  return { workspace: { ...workspace, projects, activeProjectId: project.id }, project }
}

/** Removes a project. A workspace always keeps at least one project. */
export function deleteProject(workspace: Workspace, id: string): Workspace {
  const index = workspace.projects.findIndex(project => project.id === id)
  if (index === -1) return workspace
  let projects = workspace.projects.filter(project => project.id !== id)
  if (!projects.length) projects = [createEmptyProject('My project')]
  const activeProjectId = workspace.activeProjectId === id
    ? projects[Math.min(index, projects.length - 1)].id
    : workspace.activeProjectId
  return { ...workspace, projects, activeProjectId }
}

export function setActiveProject(workspace: Workspace, id: string): Workspace {
  return workspace.projects.some(project => project.id === id) ? { ...workspace, activeProjectId: id } : workspace
}

/** Separator for composite keys used by cross-project views. */
export const PROJECT_KEY_SEPARATOR = '::'

export function compositeKey(projectId: string, id: string): string {
  return `${projectId}${PROJECT_KEY_SEPARATOR}${id}`
}

export function splitCompositeKey(key: string): { projectId: string; id: string } | undefined {
  const at = key.indexOf(PROJECT_KEY_SEPARATOR)
  return at === -1 ? undefined : { projectId: key.slice(0, at), id: key.slice(at + PROJECT_KEY_SEPARATOR.length) }
}
