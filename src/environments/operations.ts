import type { Environment, Project, Variable } from '../workspace/types'
import { newId } from './variables'

/** Pure environment operations. Each returns a new project. */

export function createVariable(partial: Partial<Variable> = {}): Variable {
  return { id: newId('var'), key: '', value: '', secret: false, enabled: true, ...partial }
}

function uniqueName(project: Project, base: string): string {
  const names = new Set(project.environments.map(environment => environment.name.toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  for (let index = 2; ; index++) if (!names.has(`${base} ${index}`.toLowerCase())) return `${base} ${index}`
}

export function addEnvironment(project: Project, name = 'New environment', baseUrl = ''): { project: Project; environment: Environment } {
  const environment: Environment = { id: newId('env'), name: uniqueName(project, name.trim() || 'New environment'), baseUrl, variables: [] }
  const environments = [...project.environments, environment]
  // Like Apidog: with nothing selected, a lone environment becomes active.
  const activeEnvironmentId = project.activeEnvironmentId ?? (environments.length === 1 ? environment.id : null)
  return { project: { ...project, environments, activeEnvironmentId }, environment }
}

export function renameEnvironment(project: Project, id: string, name: string): Project {
  const trimmed = name.trim()
  if (!trimmed) return project
  return { ...project, environments: project.environments.map(environment => environment.id === id ? { ...environment, name: trimmed } : environment) }
}

/**
 * Copies name, base URL and variables under new IDs. Secret values are
 * copied by the main process via `copySecretFrom`; plain values are copied here.
 */
export function duplicateEnvironment(project: Project, id: string): { project: Project; environment?: Environment } {
  const index = project.environments.findIndex(environment => environment.id === id)
  if (index === -1) return { project }
  const source = project.environments[index]
  const environment: Environment = {
    ...structuredClone(source),
    id: newId('env'),
    name: uniqueName(project, `${source.name} copy`),
    variables: source.variables.map(variable => ({
      ...variable,
      id: newId('var'),
      value: variable.secret ? '' : variable.value,
      hasStoredSecret: undefined,
      ...(variable.secret && variable.hasStoredSecret ? { copySecretFrom: variable.id } : {})
    }))
  }
  const environments = [...project.environments]
  environments.splice(index + 1, 0, environment)
  return { project: { ...project, environments }, environment }
}

export function deleteEnvironment(project: Project, id: string): Project {
  const environments = project.environments.filter(environment => environment.id !== id)
  const activeEnvironmentId = project.activeEnvironmentId === id ? null : project.activeEnvironmentId
  return { ...project, environments, activeEnvironmentId }
}

export function setActiveEnvironment(project: Project, id: string | null): Project {
  if (id !== null && !project.environments.some(environment => environment.id === id)) return project
  return { ...project, activeEnvironmentId: id }
}

export function updateEnvironment(project: Project, id: string, change: (environment: Environment) => Environment): Project {
  return { ...project, environments: project.environments.map(environment => environment.id === id ? change(environment) : environment) }
}
