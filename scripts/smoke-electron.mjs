import { _electron as electronTest } from 'playwright'
import electronPath from 'electron'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const evidence = resolve('docs/apidog-search/evidence/reqora-runtime')
await mkdir(evidence, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'reqora-smoke-'))
const env = { ...process.env, REQORA_SMOKE_TEST: '1' }
delete env.ELECTRON_RUN_AS_NODE
let application
let page
const failures = []
const checks = []
const check = (name) => checks.push(name)
async function capture(name) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
  const base64 = await application.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
    return image.toPNG().toString('base64')
  })
  await writeFile(join(evidence, name), Buffer.from(base64, 'base64'))
}
try {
  application = await electronTest.launch({
    executablePath: electronPath,
    args: ['.', `--user-data-dir=${profile}`],
    env,
    timeout: 30000
  })
  page = await application.firstWindow()
  page.on('pageerror', error => failures.push(error.message))
  const search = page.getByRole('searchbox', { name: 'Search project', exact: true })
  await search.waitFor()
  await page.getByRole('heading', { name: 'List users', exact: true }).waitFor()
  check('Actual built Electron app loads its renderer and synthetic workspace')
  const isolation = await page.evaluate(() => ({ node: typeof window.require, process: typeof window.process }))
  assert.deepEqual(isolation, { node: 'undefined', process: 'undefined' })
  check('Renderer has no Node require/process globals')

  await page.keyboard.press('Control+k')
  assert.equal(await search.evaluate(element => document.activeElement === element), true)
  await search.fill('users')
  await page.getByRole('option').first().waitFor()
  assert.equal(await page.getByRole('option').count(), 7)
  await capture('reqora-search.png')
  check('Ctrl+K focuses search; users query returns 7 resources with real rendered results')

  await search.fill('/v1/users/42')
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 2)
  await search.press('ArrowDown')
  await search.press('Enter')
  await page.getByRole('heading', { name: 'Update user', exact: true }).waitFor()
  check('Concrete parameterized path returns two endpoints; arrow/Enter opens selected detail')

  await search.press('Escape')
  assert.equal(await search.inputValue(), '')
  await page.getByRole('button', { name: '/v1/users/42', exact: true }).waitFor()
  check('Escape clears search and the committed query appears in recent history')
  await page.reload()
  await search.waitFor()
  await page.getByRole('button', { name: '/v1/users/42', exact: true }).waitFor()
  check('Recent query survives a renderer reload')

  await page.getByRole('button', { name: 'Choose search fields', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Draft', exact: true }).check()
  await page.getByRole('option', { name: /Cancel order/ }).waitFor()
  assert.equal(await page.getByRole('option').count(), 1)
  await capture('reqora-filters.png')
  await page.reload()
  await page.getByRole('option', { name: /Cancel order/ }).waitFor()
  assert.equal(await page.getByRole('option').count(), 1)
  check('Blank-query metadata filtering finds the Draft endpoint and survives reload')
  await page.getByRole('button', { name: 'Choose search fields', exact: true }).click()
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await page.getByRole('button', { name: 'Choose search fields', exact: true }).click()

  await search.fill('<img src=x onerror=alert(1)>')
  await page.getByRole('heading', { name: /No matches for/ }).waitFor()
  assert.equal(await page.locator('img').count(), 0)
  check('Query containing HTML renders as text and creates no image element')

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 720))
  await page.setViewportSize({ width: 1000, height: 720 })
  await search.fill('checkout')
  await page.getByRole('option').first().waitFor()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  assert.equal(overflow, false)
  await capture('reqora-search-compact.png')
  check('Search remains usable at the Electron minimum viewport without horizontal overflow')
  assert.deepEqual(failures, [])
  check('No renderer page errors observed during the smoke scenario')
  await writeFile(join(evidence, 'smoke-result.json'), JSON.stringify({
    target: 'Reqora prototype (not Apidog)',
    command: 'pnpm build && pnpm smoke:electron',
    outcome: 'passed', checks, rendererErrors: failures,
    screenshots: ['reqora-search.png', 'reqora-search-compact.png', 'reqora-filters.png']
  }, null, 2))
  console.log(JSON.stringify({ outcome: 'passed', checks }, null, 2))
} finally {
  await application?.close()
  // Only remove the fresh, owned smoke-test profile after Electron exits.
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') || resolve(profile).startsWith(resolve(tmpdir()) + '/')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
}
