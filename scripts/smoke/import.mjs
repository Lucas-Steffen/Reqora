import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const fixtures = resolve('src/importer/__fixtures__')

/**
 * Import scenario: native picker (dialog stubbed in main to return a real
 * temp file), drag-and-drop of a real file, URL import from a loopback server
 * (with redirect + external ref), timeout error, re-import merge, persistence.
 */
export async function importScenario({ application, page, capture, check, server, workDir }) {
  const evidence = 'docs/apidog-import/evidence/reqora-runtime'
  const specDir = join(workDir, 'specs')
  await mkdir(specDir, { recursive: true })
  await copyFile(join(fixtures, 'garden.yaml'), join(specDir, 'garden.yaml'))
  await copyFile(join(fixtures, 'common.yaml'), join(specDir, 'common.yaml'))
  await copyFile(join(fixtures, 'library.json'), join(specDir, 'library.json'))
  await writeFile(join(specDir, 'notes.txt'), 'not a spec')

  const dialog = page.getByRole('dialog', { name: 'Import OpenAPI / Swagger' })
  const results = page.getByRole('listbox', { name: 'Search matches' })
  const openImport = () => page.getByRole('button', { name: 'Import OpenAPI / Swagger', exact: true }).click()

  // 1. Native file picker, stubbed only at the OS-dialog boundary.
  await application.evaluate(({ dialog: electronDialog }, path) => {
    electronDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, join(specDir, 'garden.yaml'))
  await openImport()
  await dialog.getByRole('button', { name: 'Choose file…' }).click()
  await dialog.locator('.preview-summary strong', { hasText: 'Garden Supply API' }).waitFor()
  assert.equal(await dialog.getByRole('row').count(), 6)
  const warnings = await dialog.locator('.import-warnings').count()
  await capture(evidence, 'import-preview.png')
  assert.equal(await dialog.getByRole('radio', { name: /New project/ }).isChecked(), true)
  await dialog.getByRole('button', { name: 'Import 5 endpoints' }).click()
  await page.getByText('Imported 5 endpoints from Garden Supply API into new project "Garden Supply API".').waitFor()
  assert.equal(await page.getByRole('combobox', { name: 'Active project' }).inputValue() !== 'commerce', true)
  check(`File picker → main reads garden.yaml + sibling common.yaml ref → preview (5 endpoints, ${warnings ? 'recursive-ref warning' : 'no warnings'}) → imported into a new project, which becomes active`)

  const search = page.getByRole('searchbox', { name: 'Search project', exact: true })
  await search.fill('/plants/pl_9')
  await results.getByRole('option', { name: /Get plant/ }).waitFor()
  assert.equal(await results.getByRole('option').count(), 1)
  await search.fill('')
  check('Imported endpoint is found by the existing search with a concrete parameterized path')

  // 2. Drag and drop a real file (Playwright attaches the on-disk file so webUtils resolves its path).
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.id = 'smoke-drop-source'
    input.style.display = 'none'
    document.body.append(input)
  })
  await page.setInputFiles('#smoke-drop-source', join(specDir, 'library.json'))
  await page.evaluate(() => {
    const input = document.getElementById('smoke-drop-source')
    const transfer = new DataTransfer()
    transfer.items.add(input.files[0])
    document.querySelector('.app-shell').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
    input.remove()
  })
  await dialog.locator('.preview-summary strong', { hasText: 'Library Catalog' }).waitFor()
  await dialog.getByRole('radio', { name: /Current project “Garden Supply API”/ }).check()
  await dialog.getByRole('button', { name: 'Import 3 endpoints' }).click()
  await page.getByText('Imported 3 endpoints from Library Catalog.').waitFor()
  check('Dropping library.json (Swagger 2.0 JSON) on the window opens the preview; imported into the current project by choice')

  // 3. URL import through main: redirect + relative external reference, served on loopback.
  await openImport()
  await dialog.getByRole('tab', { name: 'URL' }).click()
  await dialog.getByLabel('Document URL').fill(`${server.url}/redirect-to-garden`)
  await dialog.getByRole('button', { name: 'Fetch' }).click()
  await dialog.locator('.preview-summary strong', { hasText: 'Garden Supply API' }).waitFor()
  assert.equal(server.hits.includes('/common.yaml'), true)
  check('URL import is fetched by the main process (no CORS headers served), follows a redirect and loads the relative external ref')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // 4. Clear failures: timeout and unsupported scheme.
  await openImport()
  await dialog.getByRole('tab', { name: 'URL' }).click()
  await dialog.getByLabel('Document URL').fill(`${server.url}/hang`)
  await dialog.getByRole('button', { name: 'Fetch' }).click()
  await dialog.getByRole('alert').getByText('The server did not finish responding within 10 seconds.').waitFor({ timeout: 15000 })
  await capture(evidence, 'import-timeout-error.png')
  await dialog.getByLabel('Document URL').fill('ftp://127.0.0.1/spec.yaml')
  await dialog.getByRole('button', { name: 'Fetch' }).click()
  await dialog.getByRole('alert').getByText(/Only http:\/\/ and https:\/\/ URLs/).waitFor()
  check('Hanging server produces the 10 s timeout error; ftp:// is rejected with a clear message')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // 5. Re-import the same file: merge vs overwrite choice.
  await openImport()
  await dialog.getByRole('button', { name: 'Choose file…' }).click()
  await dialog.getByText('This document was imported before').waitFor()
  assert.equal(await dialog.getByRole('radio', { name: /Merge/ }).isChecked(), true)
  await capture(evidence, 'import-reimport.png')
  await dialog.getByRole('radio', { name: /Overwrite/ }).check()
  await dialog.getByRole('button', { name: 'Overwrite import' }).click()
  await page.getByText('Overwrote with 5 endpoints from Garden Supply API.').waitFor()
  check('Re-importing garden.yaml shows the merge/overwrite choice and applies overwrite')

  // 6. Persistence through the main-process store.
  await page.reload()
  await page.getByRole('button', { name: 'Plants', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Books', exact: true }).waitFor()
  await capture(evidence, 'import-tree.png')
  check('Imported folders persist across a renderer reload (atomic JSON store in userData)')
  await page.getByRole('combobox', { name: 'Active project' }).selectOption({ label: 'Commerce API' })
  await page.locator('.tree-record', { hasText: 'List users' }).waitFor()
}

export function importRoutes(fixtureText) {
  return {
    '/garden.yaml': { type: 'application/yaml', body: fixtureText.garden },
    '/common.yaml': { type: 'application/yaml', body: fixtureText.common },
    '/redirect-to-garden': { status: 302, location: '/garden.yaml' }
  }
}
