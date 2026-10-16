import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** A pre-multi-project (version 1) workspace file, as earlier Reqora builds wrote it. */
function legacyWorkspace() {
  const endpoint = (id, name, method, path, folderId) => ({ id, folderId, name, method, path, tags: ['legacy'], query: [], headers: [], pathParams: [], cookies: [], body: { mode: 'none' }, responses: [] })
  return {
    version: 1,
    revision: 12,
    activeProjectId: 'legacy',
    projects: [{
      id: 'legacy',
      name: 'Legacy API',
      folders: [{ id: 'accounts', name: 'Accounts' }],
      endpoints: [endpoint('list-accounts', 'List accounts', 'GET', '/v1/accounts', 'accounts'), endpoint('close-account', 'Close account', 'DELETE', '/v1/accounts/{accountId}', 'accounts')],
      resources: [],
      importSources: []
    }]
  }
}

/**
 * Projects scenario on its own app instance and profile: a v1 file is
 * migrated without loss (with a one-time backup), more than five projects are
 * created (Apidog's import limit), and search can span all projects.
 */
export async function projectsScenario({ launch, check, workDir }) {
  const evidence = 'docs/projects/evidence'
  const profile = join(workDir, 'profile-projects')
  await mkdir(profile, { recursive: true })
  const legacy = JSON.stringify(legacyWorkspace(), null, 2)
  await writeFile(join(profile, 'workspace.json'), legacy)
  const { application, page, capture, close } = await launch(profile)
  try {
    const projectSelect = page.getByRole('combobox', { name: 'Active project' })
    await page.locator('.tree-record', { hasText: 'List accounts' }).waitFor()
    assert.equal(await projectSelect.inputValue(), 'legacy')
    check('A version-1 single-project workspace opens with all its folders and endpoints')

    const manager = page.getByRole('dialog', { name: 'Projects' })
    await page.getByRole('button', { name: 'Manage projects' }).click()
    for (let i = 0; i < 6; i++) await manager.getByRole('button', { name: 'New project', exact: true }).click()
    await manager.getByText('7 projects · no limit.', { exact: false }).waitFor()
    await manager.getByRole('button', { name: 'Rename New project 6', exact: true }).click()
    await manager.getByRole('textbox', { name: 'New name for New project 6' }).fill('Sixth')
    await manager.getByRole('textbox', { name: 'New name for New project 6' }).press('Enter')
    await manager.getByRole('button', { name: 'Duplicate Legacy API', exact: true }).click()
    await manager.getByRole('button', { name: 'Delete New project 2', exact: true }).click()
    await manager.getByRole('button', { name: 'Delete', exact: true }).click()
    await manager.getByText('7 projects · no limit.', { exact: false }).waitFor()
    await capture(evidence, 'projects-manager.png')
    await manager.getByRole('button', { name: 'Done' }).click()
    assert.equal(await projectSelect.locator('option').count(), 7)
    check('Created 6 projects (more than Apidog\'s 5-project import limit), renamed, duplicated and deleted through the Projects dialog')

    await projectSelect.selectOption({ label: 'Sixth' })
    await page.locator('.tree-record').first().waitFor({ state: 'detached' }).catch(() => undefined)
    const search = page.getByRole('searchbox', { name: 'Search project', exact: true })
    await search.fill('/v1/accounts/9')
    await page.getByRole('heading', { name: /No matches for/ }).waitFor()
    await page.getByRole('button', { name: 'All projects' }).click()
    const results = page.getByRole('listbox', { name: 'Search matches' })
    await results.getByRole('option').first().waitFor()
    assert.equal(await results.getByRole('option').count(), 2) // Legacy API and its copy
    await capture(evidence, 'projects-search-all.png')
    await results.getByRole('option').first().click()
    await page.getByRole('heading', { name: 'Close account', exact: true }).waitFor()
    assert.equal(await projectSelect.inputValue(), 'legacy')
    await page.getByRole('button', { name: 'This project' }).click()
    check('Search runs in the active project only; "All projects" finds the endpoint in both projects and opening it switches project')

    await page.reload()
    await page.locator('.tree-record', { hasText: 'Close account' }).waitFor()
    assert.equal(await projectSelect.locator('option').count(), 7)
    const backup = await readFile(join(profile, 'workspace.v1.backup.json'), 'utf8')
    assert.equal(backup, legacy)
    const stored = JSON.parse(await readFile(join(profile, 'workspace.json'), 'utf8'))
    assert.equal(stored.version, 2)
    assert.equal(stored.projects.find(project => project.id === 'legacy').endpoints.length, 2)
    check('After reload all 7 projects persist; workspace.json is version 2 and workspace.v1.backup.json holds the original bytes')
    void application
  } finally {
    await close()
  }
}
