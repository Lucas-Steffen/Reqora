import assert from 'node:assert/strict'

/** A spec served by the loopback server; its relative server resolves to the mock itself. */
export function sendingRoutes(hits) {
  const echo = {
    handler(request, body, response) {
      hits.push({ method: request.method, url: request.url, headers: request.headers, body })
      response.writeHead(request.method === 'POST' ? 201 : 200, { 'content-type': 'application/json', 'x-mock': 'yes' })
      response.end(JSON.stringify({ method: request.method, url: request.url, received: body ? JSON.parse(body) : null }))
    }
  }
  return {
    '/pets-api/openapi.json': {
      type: 'application/json',
      body: JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Mock Pets', version: '1.0.0' },
        servers: [{ url: '/pets-api/v1', description: 'Mock server' }],
        paths: {
          '/pets': {
            get: { tags: ['Pets'], summary: 'List pets', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', example: 5 } }], responses: { 200: { description: 'ok' } } },
            post: { tags: ['Pets'], summary: 'Create pet', requestBody: { content: { 'application/json': { example: { name: 'Rex' } } } }, responses: { 201: { description: 'created' } } }
          },
          '/pets/{petId}': { get: { tags: ['Pets'], summary: 'Get pet', parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'ok' } } } }
        }
      })
    },
    '/pets-api/v1/pets': echo,
    '/pets-api/v1/pets/42': echo
  }
}

/**
 * Root-cause regression in the real app: endpoints imported from a URL are
 * sent to the document's server even though an unrelated environment is
 * active; path params must be filled; results show status/time/size/headers/body.
 */
export async function sendingScenario({ page, capture, check, server }) {
  const evidence = 'docs/request-sending/evidence'
  const hits = server.sendingHits
  const dialog = page.getByRole('dialog', { name: 'Import OpenAPI / Swagger' })
  await page.getByRole('combobox', { name: 'Active project' }).selectOption({ label: 'Commerce API' })
  await page.getByRole('combobox', { name: 'Active environment' }).selectOption({ label: 'Local' })
  await page.getByRole('button', { name: 'Import OpenAPI / Swagger', exact: true }).click()
  await dialog.getByRole('tab', { name: 'URL' }).click()
  await dialog.getByLabel('Document URL').fill(`${server.url}/pets-api/openapi.json`)
  await dialog.getByRole('button', { name: 'Fetch' }).click()
  await dialog.getByText(`${server.url}/pets-api/v1`).waitFor()
  // Into the current project, where the unrelated "Local" environment is active (the original bug setup).
  await dialog.getByRole('radio', { name: /Current project “Commerce API”/ }).check()
  await dialog.getByRole('button', { name: 'Import 3 endpoints' }).click()
  await page.getByText('Imported 3 endpoints from Mock Pets.').waitFor()
  check('Imported a URL spec whose relative server ("/pets-api/v1") resolves against the document URL')

  await page.locator('.tree-record', { hasText: 'List pets' }).click()
  await page.getByRole('tab', { name: 'Request' }).click()
  await page.locator('.request-base', { hasText: `Base URL (Server from Mock Pets): ${server.url}/pets-api/v1` }).waitFor()
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByText('200 OK').waitFor()
  assert.equal(hits.at(-1).url, '/pets-api/v1/pets?limit=5')
  const meta = await page.locator('.response-meta').innerText()
  assert.match(meta, /200 OK[\s\S]*\d+ ms[\s\S]*\d+ B/)
  await page.getByRole('tab', { name: 'Headers', exact: true }).last().click()
  await page.locator('.code-preview', { hasText: 'x-mock: yes' }).waitFor()
  await capture(evidence, 'send-list-pets.png')
  check('List pets was sent by main to the spec server (not the active "Local" environment) and shows status, time, size and headers')

  await page.locator('.tree-record', { hasText: 'Get pet' }).click()
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('alert').getByText('Fill in path parameter(s) before sending: petId.').waitFor()
  const before = hits.length
  await page.getByRole('tab', { name: 'Path' }).click()
  await page.getByRole('textbox', { name: 'Path value for petId' }).fill('42')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByText('200 OK').waitFor()
  assert.equal(hits.length, before + 1)
  assert.equal(hits.at(-1).url, '/pets-api/v1/pets/42')
  check('A missing path parameter is reported before sending; once filled, /pets/42 is sent')

  await page.locator('.tree-record', { hasText: 'Create pet' }).click()
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByText('201 Created').waitFor()
  assert.deepEqual(JSON.parse(hits.at(-1).body), { name: 'Rex' })
  await page.getByRole('tablist', { name: 'Response parts' }).getByRole('tab', { name: 'Body' }).click()
  await page.locator('.response-body', { hasText: '"received"' }).waitFor()
  check('Create pet sent the JSON example body and shows the formatted response body')

  await page.getByRole('textbox', { name: 'Request URL' }).fill('http://reqora-smoke.invalid/pets')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('alert').locator('.error-code').filter({ hasText: /DNS|NETWORK/ }).waitFor({ timeout: 35000 })
  await capture(evidence, 'send-dns-error.png')
  check('An unresolvable .invalid host (RFC 6761, never reachable) yields a classified DNS error')
}
