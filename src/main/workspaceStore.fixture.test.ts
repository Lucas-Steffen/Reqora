// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFileWorkspaceStore } from './workspaceStore'

// The Rust store (src-tauri/src/store/workspace.rs) saves the same input and
// compares against the same expected bytes. Regenerate with REQORA_UPDATE_FIXTURES=1.
const fixtures = join(__dirname, '../shared/contract/workspace-store')

describe('workspace store byte fixture', () => {
  it('writes the contract fixture byte for byte', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reqora-fixture-'))
    try {
      const store = createFileWorkspaceStore(directory)
      expect((await store.load()).revision).toBe(0)
      await store.save(JSON.parse(await readFile(join(fixtures, 'input.json'), 'utf8')))
      const written = await readFile(join(directory, 'workspace.json'))
      if (process.env.REQORA_UPDATE_FIXTURES === '1') await writeFile(join(fixtures, 'expected.json'), written)
      expect(written.equals(await readFile(join(fixtures, 'expected.json')))).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
