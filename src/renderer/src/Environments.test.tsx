import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryWorkspaceRepository } from '../../workspace/repository'
import { activeProject } from '../../workspace/types'
import type { RunResult } from '../../runner/run'
import App from './App'
import type { RequestGateway } from './requestGateway'

const manager = () => within(screen.getByRole('dialog', { name: 'Environments' }))

function gateway(result: Partial<RunResult> = {}): RequestGateway {
  return {
    send: vi.fn(async () => ({
      ok: true,
      unresolved: [],
      request: { method: 'GET', url: 'http://127.0.0.1:4010/v1/users', headers: [['X-Api-Key', '••••••']] },
      response: { status: 200, statusText: 'OK', headers: [['content-type', 'application/json']], body: '{"ok":true}', truncated: false, sizeBytes: 11, timeMs: 5, url: 'http://127.0.0.1:4010/v1/users' },
      ...result
    }) as RunResult),
    reveal: vi.fn(async () => 'revealed-secret')
  }
}

describe('environments', () => {
  it('switches the active environment from the top bar and persists it', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    render(<App workspaceRepository={repository} requestGateway={gateway()} />)
    const select = await screen.findByRole('combobox', { name: 'Active environment' })
    expect(select).toHaveValue('env_local')
    await user.selectOptions(select, 'Staging')
    await waitFor(async () => expect(activeProject(await repository.load()).activeEnvironmentId).toBe('env_staging'))
    await user.selectOptions(select, 'No environment')
    await waitFor(async () => expect(activeProject(await repository.load()).activeEnvironmentId).toBeNull())
  })

  it('creates, renames, edits, duplicates and deletes environments', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    render(<App workspaceRepository={repository} requestGateway={gateway()} />)
    await user.click(await screen.findByRole('button', { name: 'Manage environments' }))
    expect(manager().getByText(/script \(local\) variables, then the active environment, then globals/)).toBeVisible()

    await user.click(manager().getByRole('button', { name: 'New environment' }))
    const name = manager().getByRole('textbox', { name: 'Environment name' })
    await user.clear(name)
    await user.type(name, 'QA{Enter}')
    await user.type(manager().getByRole('textbox', { name: 'Base URL' }), 'https://qa.commerce.test')
    await user.click(manager().getByRole('button', { name: 'Add variable' }))
    await user.type(manager().getByRole('textbox', { name: 'Variable name' }), 'userId')
    await user.type(manager().getByRole('textbox', { name: 'Value of userId' }), 'usr_qa')
    await waitFor(async () => {
      const qa = activeProject(await repository.load()).environments.find(environment => environment.name === 'QA')
      expect(qa).toMatchObject({ baseUrl: 'https://qa.commerce.test', variables: [{ key: 'userId', value: 'usr_qa' }] })
    })

    await user.click(manager().getByRole('button', { name: 'Duplicate' }))
    expect(await manager().findByRole('button', { name: 'QA copy' })).toBeVisible()
    await user.click(manager().getByRole('button', { name: 'Use this environment' }))
    expect(screen.getByRole('combobox', { name: 'Active environment' })).toHaveDisplayValue('QA copy')

    await user.click(manager().getByRole('button', { name: 'Delete' }))
    expect(manager().getByText('Delete “QA copy” and its secrets?')).toBeVisible()
    await user.click(manager().getByRole('button', { name: 'Delete' }))
    await waitFor(async () => {
      const project = activeProject(await repository.load())
      expect(project.environments.map(environment => environment.name)).toEqual(['Local', 'Staging', 'Production', 'QA'])
      expect(project.activeEnvironmentId).toBeNull()
    })
  })

  it('treats secret values as write-only and reveals them only on request', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    const fake = gateway()
    render(<App workspaceRepository={repository} requestGateway={fake} />)
    await user.click(await screen.findByRole('button', { name: 'Manage environments' }))
    await user.click(manager().getByRole('button', { name: 'Add variable' }))
    await user.type(manager().getAllByRole('textbox', { name: 'Variable name' }).at(-1)!, 'apiKey')
    await user.click(manager().getByRole('checkbox', { name: 'Secret apiKey' }))
    const secret = manager().getByLabelText('Value of apiKey')
    expect(secret).toHaveAttribute('type', 'password')
    await user.type(secret, 'hunter2')
    // Nothing is saved while typing; the value commits on blur.
    expect(activeProject(await repository.load()).environments[0].variables.at(-1)?.value).not.toBe('hunter2')
    await user.tab()
    await waitFor(async () => expect(activeProject(await repository.load()).environments[0].variables.at(-1)).toMatchObject({ key: 'apiKey', secret: true, value: 'hunter2' }))
    expect(manager().getByLabelText('Value of apiKey')).toHaveValue('')
  })
})

describe('request tab', () => {
  it('sends the edited draft through the gateway and shows the response, unresolved variables and the masked request', async () => {
    const user = userEvent.setup()
    const fake = gateway({ unresolved: ['missing'] })
    render(<App workspaceRepository={createMemoryWorkspaceRepository()} requestGateway={fake} />)
    await user.click(await screen.findByRole('tab', { name: 'Request' }))
    expect(screen.getByText('Base URL from', { exact: false })).toHaveTextContent('Base URL from Local: http://127.0.0.1:4010')
    await user.click(screen.getByRole('tab', { name: 'Headers' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByRole('textbox', { name: 'Headers name' }), 'X-Api-Key')
    await user.type(screen.getByRole('textbox', { name: 'Headers value for X-Api-Key' }), '{{{{apiKey}}')
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('200 OK')).toBeVisible()
    expect(fake.send).toHaveBeenCalledWith({ endpointId: 'get-users', draft: expect.objectContaining({ headers: [{ key: 'X-Api-Key', value: '{{apiKey}}', enabled: true }] }) })
    expect(screen.getByText('Unresolved variables: {{missing}}')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Sent request' }))
    expect(screen.getByLabelText('Sent request')).toHaveTextContent('X-Api-Key: ••••••')
  })

  it('saves the draft into the endpoint', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    render(<App workspaceRepository={repository} requestGateway={gateway()} />)
    await user.click(await screen.findByRole('tab', { name: 'Request' }))
    const url = screen.getByRole('textbox', { name: 'Request URL' })
    await user.clear(url)
    await user.type(url, '/v2/users')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(activeProject(await repository.load()).endpoints.find(endpoint => endpoint.id === 'get-users')?.path).toBe('/v2/users'))
  })
})
