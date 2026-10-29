// Produces an Electron profile with secrets encrypted by the real
// `safeStorage`, for the Tauri secret migration (TASK-011).
// Usage: electron scripts/fixtures/electron-secrets.cjs <empty output dir>
const { app, safeStorage } = require('electron')
const { writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const out = resolve(process.argv[process.argv.length - 1])
app.setPath('userData', out)

const values = {
  'var-plain': 'super-secret-token',
  'var-unicode': 'senha çãõ ✓ 🔑',
  'var-empty': '',
  'var-long': 'x'.repeat(4096)
}

app.whenReady().then(() => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage is not available')
  const secrets = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, safeStorage.encryptString(value).toString('base64')]))
  writeFileSync(join(out, 'secrets.json'), JSON.stringify(secrets))
  writeFileSync(join(out, 'expected.json'), JSON.stringify({ electron: process.versions.electron, values }, null, 2))
  app.quit()
})
