import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { oas3Yaml } from '../../importer/fixtures'
import { importDocument } from '../../importer/pipeline'
import { createDemoWorkspace } from '../../workspace/demo'
import { createEmptyProject, addProject } from '../../workspace/projects'
import { createMemoryWorkspaceRepository } from '../../workspace/repository'
import type { ImportOutcome } from '../../shared/api'
import App from './App'
import type { ImportGateway } from './importGateway'
import { historyKey } from './preferences'

const projects = () => within(screen.getByRole('dialog', { name: 'Projects' }))
const results = () => within(screen.getByRole('region', { name: 'Project search results' }))
const projectSelect = () => screen.getByRole('combobox', { name: 'Active project' })

function twoProjects() {
  const second = createEmptyProject('Billing API', 'prj_billing')
  second.endpoints = [{ id: 'list-invoices', name: 'List invoices', method: 'GET', path: '/v1/invoices', tags: ['billing'], query: [], headers: [], pathParams: [], cookies: [], body: { mode: 'none' }, responses: [] }]
  return addProject(createDemoWorkspace(), second, false)
}

describe('projects', () => {
  it('creates, renames, duplicates, switches and deletes projects', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    render(<App workspaceRepository={repository} requestGateway={{ send: vi.fn() }} />)
    await user.click(await screen.findByRole('button', { name: 'Manage projects' }))
    await user.click(projects().getByRole('button', { name: 'New project' }))
    await user.click(projects().getByRole('button', { name: 'Rename New project' }))
    const input = projects().getByRole('textbox', { name: 'New name for New project' })
    await user.clear(input)
    await user.type(input, 'Payments{Enter}')
    await user.click(projects().getByRole('button', { name: 'Duplicate Commerce API' }))
    expect(projects().getByText('3 projects · no limit. Each project has its own endpoints, environments and search history.')).toBeVisible()
    await waitFor(async () => expect((await repository.load()).projects.map(project => project.name)).toEqual(['Commerce API', 'Commerce API copy', 'Payments']))

    await user.click(projects().getByRole('button', { name: 'Delete Payments' }))
    await user.click(projects().getByRole('button', { name: 'Delete' }))
    await user.click(projects().getByRole('button', { name: 'Done' }))
    await waitFor(async () => expect((await repository.load()).projects.map(project => project.name)).toEqual(['Commerce API', 'Commerce API copy']))
    expect(projectSelect()).toHaveDisplayValue('Commerce API copy')
    await user.selectOptions(projectSelect(), 'Commerce API')
    await waitFor(async () => expect((await repository.load()).activeProjectId).toBe('commerce'))
  })

  it('shows only the active project in the tree and keeps search history per project', async () => {
    const user = userEvent.setup()
    localStorage.setItem(historyKey('prj_billing'), JSON.stringify(['invoices']))
    render(<App workspaceRepository={createMemoryWorkspaceRepository(twoProjects())} requestGateway={{ send: vi.fn() }} />)
    await screen.findByRole('button', { name: 'Users' })
    expect(screen.queryByText('List invoices')).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search project' }), 'users{Enter}')
    await user.clear(screen.getByRole('searchbox', { name: 'Search project' }))

    await user.selectOptions(projectSelect(), 'Billing API')
    expect(await screen.findByRole('button', { name: /List invoices/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Users' })).not.toBeInTheDocument()
    expect(results().getByRole('button', { name: 'invoices' })).toBeVisible()
    expect(results().queryByRole('button', { name: 'users' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(historyKey('commerce'))!)).toEqual(['users'])
    expect(JSON.parse(localStorage.getItem(historyKey('prj_billing'))!)).toEqual(['invoices'])
  })

  it('searches the active project by default and all projects on request, opening results in their project', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository(twoProjects())
    render(<App workspaceRepository={repository} requestGateway={{ send: vi.fn() }} />)
    const search = await screen.findByRole('searchbox', { name: 'Search project' })
    await screen.findByRole('button', { name: 'Users' })
    await user.type(search, '/v1/invoices')
    expect(await results().findByRole('heading', { name: 'No matches for “/v1/invoices”' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'All projects' }))
    const option = await results().findByRole('option', { name: /List invoices/ })
    expect(option).toHaveTextContent('Billing API')
    await user.click(option)
    await waitFor(() => expect(projectSelect()).toHaveDisplayValue('Billing API'))
    expect(await within(screen.getByRole('region', { name: 'Selected resource' })).findByRole('heading', { name: 'List invoices' })).toBeVisible()
    expect(localStorage.getItem('reqora.search.scope.v1')).toBe('"all"')
  })

  it('imports into the current project when chosen, or into a new project by default', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    const outcome = async (): Promise<ImportOutcome> => ({ ok: true, spec: await importDocument(oas3Yaml, 'file:///garden.yaml', async () => '{}'), origin: { kind: 'file', location: 'garden.yaml', identity: '/x/garden.yaml' } })
    const gateway: ImportGateway = { pickFile: vi.fn(outcome), fromDroppedFile: vi.fn(outcome), fromUrl: vi.fn(outcome) }
    render(<App workspaceRepository={repository} importGateway={gateway} requestGateway={{ send: vi.fn() }} />)
    await user.click(await screen.findByRole('button', { name: 'Import OpenAPI / Swagger' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Import OpenAPI / Swagger' }))
    await user.click(dialog.getByRole('button', { name: 'Choose file…' }))
    expect(await dialog.findByRole('radio', { name: /New project/ })).toBeChecked()
    await user.click(dialog.getByRole('radio', { name: /Current project/ }))
    expect(dialog.getByRole('checkbox', { name: /Create an environment from the document's servers/ })).not.toBeChecked()
    await user.click(dialog.getByRole('button', { name: 'Import 5 endpoints' }))
    expect(await screen.findByText('Imported 5 endpoints from Garden Supply API.')).toBeVisible()
    const saved = await repository.load()
    expect(saved.projects).toHaveLength(1)
    expect(saved.projects[0].endpoints.some(endpoint => endpoint.path === '/plants')).toBe(true)

    // The same document is now "imported before" in this project; a new project is still possible.
    await user.click(screen.getByRole('button', { name: 'Import OpenAPI / Swagger' }))
    const again = within(screen.getByRole('dialog', { name: 'Import OpenAPI / Swagger' }))
    await user.click(again.getByRole('button', { name: 'Choose file…' }))
    expect(await again.findByRole('radio', { name: /Current project “Commerce API” \(imported here before\)/ })).toBeChecked()
    await user.click(again.getByRole('radio', { name: /New project/ }))
    expect(again.getByRole('checkbox', { name: /Create an environment/ })).toBeChecked()
    await user.click(again.getByRole('button', { name: 'Import 5 endpoints' }))
    await screen.findByText('Imported 5 endpoints from Garden Supply API into new project "Garden Supply API".')
    const final = await repository.load()
    expect(final.projects.map(project => project.name)).toEqual(['Commerce API', 'Garden Supply API'])
    expect(final.projects[1].environments).toHaveLength(1)
    expect(final.projects[1].activeEnvironmentId).toBe(final.projects[1].environments[0].id)
  })
})
