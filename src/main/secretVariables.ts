import type { Variable, Workspace } from '../workspace/types'
import type { SecretStore } from './secretStore'

function allVariables(workspace: Workspace): Variable[] {
  return workspace.projects.flatMap(project => [...project.globals, ...project.environments.flatMap(environment => environment.variables)])
}

function mapVariables(workspace: Workspace, change: (variable: Variable) => Variable): Workspace {
  return {
    ...workspace,
    projects: workspace.projects.map(project => ({
      ...project,
      globals: project.globals.map(change),
      environments: project.environments.map(environment => ({ ...environment, variables: environment.variables.map(change) }))
    }))
  }
}

/**
 * Runs before the workspace is written. Secret values move into the encrypted
 * store and are blanked; a non-secret variable loses any stored secret;
 * orphaned secrets (deleted variables) are removed. The returned workspace
 * contains no secret plain text.
 */
export async function extractSecrets(workspace: Workspace, store: SecretStore): Promise<Workspace> {
  const secretIds = new Set<string>()
  for (const variable of allVariables(workspace)) {
    if (!variable.secret) continue
    secretIds.add(variable.id)
    if (variable.value) await store.set(variable.id, variable.value)
    else if (variable.copySecretFrom && !(await store.has(variable.id))) {
      const copied = await store.get(variable.copySecretFrom)
      if (copied !== undefined) await store.set(variable.id, copied)
    }
  }
  await store.retainOnly(secretIds)
  const stored = new Set(await store.ids())
  return mapVariables(workspace, variable => {
    const { copySecretFrom: _copy, hasStoredSecret: _has, ...rest } = variable
    return variable.secret ? { ...rest, value: '', hasStoredSecret: stored.has(variable.id) } : rest
  })
}

/** Runs after load: blank any secret value and flag which secrets exist. */
export async function annotateSecrets(workspace: Workspace, store: SecretStore): Promise<Workspace> {
  const stored = new Set(await store.ids())
  return mapVariables(workspace, variable => variable.secret
    ? { ...variable, value: '', hasStoredSecret: stored.has(variable.id) }
    : variable)
}
