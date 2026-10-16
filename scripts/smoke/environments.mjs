import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const SMOKE_SECRET = 'smoke-secret-value-7f3a'

/** Echo endpoint used by the environments, scripts and auth scenarios. */
export function echoRoutes(hits) {
  return {
    '/v1/users': {
      handler(request, body, response) {
        hits.push({ path: request.url, headers: request.headers, body })
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ path: request.url, apiKey: request.headers['x-api-key'] ?? null, authorization: request.headers.authorization ?? null, data: [{ id: 'usr_01' }] }))
      }
    }
  }
}

/**
 * Environments scenario: create an environment through the UI with a base URL
 * and a secret, switch to it, send a request from main, and verify the secret
 * reached the loopback server but is masked in the UI and absent from disk.
 */
export async function environmentsScenario({ page, capture, check, server, workDir }) {
  const evidence = 'docs/apidog-environments/evidence/reqora-runtime'
  const manager = page.getByRole('dialog', { name: 'Environments' })
  await page.getByRole('button', { name: 'Manage environments' }).click()
  await manager.getByRole('button', { name: 'New environment' }).click()
  const name = manager.getByRole('textbox', { name: 'Environment name' })
  await name.fill('Loopback')
  await name.press('Enter')
  await manager.getByRole('textbox', { name: 'Base URL', exact: true }).fill(server.url)
  await manager.getByRole('button', { name: 'Add variable' }).click()
  await manager.getByRole('textbox', { name: 'Variable name' }).last().fill('apiKey')
  await manager.getByRole('checkbox', { name: 'Secret apiKey' }).check()
  await manager.getByLabel('Value of apiKey').fill(SMOKE_SECRET)
  await manager.getByLabel('Value of apiKey').press('Enter')
  await manager.getByPlaceholder('•••••••• (stored encrypted)').waitFor()
  await manager.getByRole('button', { name: 'Use this environment' }).click()
  await manager.getByRole('button', { name: 'Reveal apiKey' }).click()
  await page.waitForFunction(secret => document.querySelector('input[aria-label="Value of apiKey"]')?.value === secret, SMOKE_SECRET, { timeout: 5000 }).catch(() => undefined)
  const revealed = await manager.getByLabel('Value of apiKey').inputValue()
  assert.equal(revealed, SMOKE_SECRET, `reveal returned ${JSON.stringify(revealed)}`)
  await manager.getByRole('button', { name: 'Hide apiKey' }).click()
  await capture(evidence, 'environment-manager.png')
  check('Created "Loopback" with a base URL and a secret; the value was encrypted by main and only shown after an explicit reveal')

  const userData = join(workDir, 'profile')
  const files = await readdir(userData)
  const workspaceText = await readFile(join(userData, 'workspace.json'), 'utf8')
  const secretsText = await readFile(join(userData, 'secrets.json'), 'utf8')
  assert.equal(workspaceText.includes(SMOKE_SECRET), false)
  assert.equal(secretsText.includes(SMOKE_SECRET), false)
  assert.equal(Buffer.from(Object.values(JSON.parse(secretsText))[0], 'base64').toString('latin1').includes(SMOKE_SECRET), false)
  check(`Neither workspace.json nor secrets.json (safeStorage ciphertext) contains the secret in plain text (${files.filter(file => file.endsWith('.json')).join(', ')})`)

  await page.getByRole('button', { name: 'Close environments' }).click()
  assert.equal(await page.getByRole('combobox', { name: 'Active environment' }).inputValue() !== '', true)
  await page.locator('.tree-record', { hasText: 'List users' }).click()
  await page.getByRole('tab', { name: 'Request' }).click()
  await page.getByRole('tab', { name: 'Headers' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('textbox', { name: 'Headers name' }).fill('X-Api-Key')
  await page.getByRole('textbox', { name: 'Headers value for X-Api-Key' }).fill('{{apiKey}}')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByText('200 OK').waitFor()
  const hit = server.echoHits.at(-1)
  assert.equal(hit.path, '/v1/users')
  assert.equal(hit.headers['x-api-key'], SMOKE_SECRET)
  const pageText = await page.evaluate(() => document.body.innerText)
  assert.equal(pageText.includes(SMOKE_SECRET), false)
  assert.equal(pageText.includes('"apiKey": "••••••"'), true)
  await capture(evidence, 'environment-request.png')
  check('Send from main resolved {{apiKey}} and the base URL; loopback received the real secret; the UI shows only ••••••')

  await page.getByRole('combobox', { name: 'Active environment' }).selectOption({ label: 'No environment' })
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('alert').getByText(/No environment selected and no server/).waitFor()
  check('Switching to "No environment" makes the relative URL of a manual endpoint fail with a clear "no base URL" message before sending')
  await page.getByRole('combobox', { name: 'Active environment' }).selectOption({ label: 'Loopback' })
}
