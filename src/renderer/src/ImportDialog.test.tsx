import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { oas3Yaml, swagger2Json } from '../../importer/fixtures'
import { importDocument } from '../../importer/pipeline'
import { createMemoryWorkspaceRepository } from '../../workspace/repository'
import type { ImportOutcome } from '../../shared/api'
import App from './App'
import { createBrowserImportGateway, type ImportGateway } from './importGateway'

async function outcome(text = oas3Yaml, location = 'garden.yaml'): Promise<ImportOutcome> {
  const spec = await importDocument(text, `file:///${location}`, async () => '{}')
  return { ok: true, spec, origin: { kind: 'file', location } }
}

function gateway(overrides: Partial<ImportGateway> = {}): ImportGateway {
  return {
    pickFile: vi.fn(() => outcome()),
    fromDroppedFile: vi.fn(() => outcome()),
    fromUrl: vi.fn(async () => ({ ok: false, error: { code: 'HTTP_STATUS', message: 'The server responded with HTTP 404 Not Found for https://api.test/openapi.json.' } }) as ImportOutcome),
    ...overrides
  }
}

const results = () => within(screen.getByRole('region', { name: 'Project search results' }))
const dialog = () => within(screen.getByRole('dialog', { name: 'Import OpenAPI / Swagger' }))

describe('OpenAPI import workflow', () => {
  it('previews a picked file, commits it, and makes imported endpoints searchable and persisted', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    render(<App workspaceRepository={repository} importGateway={gateway()} />)
    await user.click(await screen.findByRole('button', { name: 'Import OpenAPI / Swagger' }))
    await user.click(dialog().getByRole('button', { name: 'Choose file…' }))
    expect(await dialog().findByText('Garden Supply API')).toBeVisible()
    expect(dialog().getByText('v1.4.0 · OpenAPI 3.0.3 · garden.yaml')).toBeVisible()
    const rows = dialog().getAllByRole('row')
    expect(rows).toHaveLength(6)
    expect(within(rows[4]).getByText('Store / Orders')).toBeVisible()
    expect(dialog().getByText(/warnings?$/)).toBeVisible()
    await user.click(dialog().getByRole('button', { name: 'Import 5 endpoints' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Imported 5 endpoints from Garden Supply API into new project "Garden Supply API".')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Active project' })).toHaveDisplayValue('Garden Supply API')
    expect(await screen.findByRole('button', { name: 'Plants' })).toBeVisible()
    await user.type(screen.getByRole('searchbox', { name: 'Search project' }), '/plants/pl_9')
    await waitFor(() => expect(results().getAllByRole('option')).toHaveLength(1))
    expect(results().getByRole('option')).toHaveTextContent('Get plant')
    const saved = await repository.load()
    expect(saved.revision).toBe(1)
    expect(saved.projects).toHaveLength(2)
    expect(saved.projects[0].importSources).toEqual([])
    expect(saved.projects[1].importSources[0]).toMatchObject({ location: 'garden.yaml', title: 'Garden Supply API' })
    expect(saved.activeProjectId).toBe(saved.projects[1].id)
  })

  it('offers merge or overwrite on re-import and applies the chosen mode', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    const fake = gateway()
    render(<App workspaceRepository={repository} importGateway={fake} />)
    await user.click(await screen.findByRole('button', { name: 'Import OpenAPI / Swagger' }))
    await user.click(dialog().getByRole('button', { name: 'Choose file…' }))
    await user.click(await dialog().findByRole('button', { name: 'Import 5 endpoints' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    vi.mocked(fake.pickFile).mockImplementation(() => outcome(oas3Yaml.replace('summary: List plants', 'summary: List all plants')))
    await user.click(screen.getByRole('button', { name: 'Import OpenAPI / Swagger' }))
    await user.click(dialog().getByRole('button', { name: 'Choose file…' }))
    expect(await dialog().findByText('This document was imported before')).toBeVisible()
    expect(dialog().getByRole('radio', { name: /Merge/ })).toBeChecked()
    expect(dialog().getByText('Updated', { selector: '.change-badge' })).toBeVisible()
    await user.click(dialog().getByRole('radio', { name: /Overwrite/ }))
    await user.click(dialog().getByRole('button', { name: 'Overwrite import' }))
    expect(await screen.findByText('Overwrote with 5 endpoints from Garden Supply API.')).toBeVisible()
    const saved = await repository.load()
    expect(saved.projects[1].importSources).toHaveLength(1)
    expect(saved.projects[1].endpoints.find(endpoint => endpoint.path === '/plants')?.name).toBe('List all plants')
  })

  it('shows URL errors clearly and cancel leaves the workspace unchanged', async () => {
    const user = userEvent.setup()
    const repository = createMemoryWorkspaceRepository()
    const save = vi.spyOn(repository, 'save')
    const fake = gateway()
    render(<App workspaceRepository={repository} importGateway={fake} />)
    await user.click(await screen.findByRole('button', { name: 'Import OpenAPI / Swagger' }))
    await user.click(dialog().getByRole('tab', { name: 'URL' }))
    await user.type(dialog().getByLabelText('Document URL'), 'https://api.test/openapi.json')
    await user.click(dialog().getByRole('button', { name: 'Fetch' }))
    expect(await dialog().findByRole('alert')).toHaveTextContent('The server responded with HTTP 404 Not Found for https://api.test/openapi.json.')
    expect(fake.fromUrl).toHaveBeenCalledWith('https://api.test/openapi.json')
    await user.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('opens the import preview when a file is dropped on the window', async () => {
    const fake = gateway({ fromDroppedFile: vi.fn(() => outcome(swagger2Json, 'library.json')) })
    render(<App workspaceRepository={createMemoryWorkspaceRepository()} importGateway={fake} />)
    await screen.findByRole('button', { name: 'Import OpenAPI / Swagger' })
    const file = new File([swagger2Json], 'library.json', { type: 'application/json' })
    fireEvent.drop(document.querySelector('.app-shell')!, { dataTransfer: { files: [file], types: ['Files'] } })
    expect(await dialog().findByText('Library Catalog')).toBeVisible()
    expect(fake.fromDroppedFile).toHaveBeenCalledWith(file)
  })

  it('browser fallback gateway parses dropped files without following external references', async () => {
    const result = await createBrowserImportGateway().fromDroppedFile(new File([oas3Yaml], 'garden.yaml'))
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.spec.warnings.some(warning => warning.includes('only followed in the desktop app'))).toBe(true)
    const failed = await createBrowserImportGateway().fromDroppedFile(new File(['not: [valid'], 'bad.yaml'))
    expect(failed).toMatchObject({ ok: false, error: { code: 'PARSE' } })
  })
})
