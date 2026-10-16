import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The subset of Electron's safeStorage used here; injectable for tests. */
export interface Cipher {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export interface SecretStore {
  has(id: string): Promise<boolean>
  get(id: string): Promise<string | undefined>
  set(id: string, value: string): Promise<void>
  delete(id: string): Promise<void>
  /** Deletes every secret whose id is not in `keep`. */
  retainOnly(keep: ReadonlySet<string>): Promise<void>
  ids(): Promise<string[]>
}

export class SecretUnavailableError extends Error {
  constructor() {
    super('Secure storage is not available on this system, so secret values cannot be saved. Unmark the variable as secret or enable the OS keychain.')
    this.name = 'SecretUnavailableError'
  }
}

/**
 * Secrets live in `secrets.json` as base64 ciphertext produced by the OS
 * (DPAPI on Windows, Keychain on macOS, libsecret/kwallet on Linux). Plain
 * text never reaches disk: if encryption is unavailable, writes fail.
 */
export function createSecretStore(directory: string, cipher: Cipher): SecretStore {
  const file = join(directory, 'secrets.json')
  let cache: Record<string, string> | undefined
  let queue: Promise<unknown> = Promise.resolve()

  async function load(): Promise<Record<string, string>> {
    if (cache) return cache
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown
      cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string')) as Record<string, string>
        : {}
    } catch {
      cache = {}
    }
    return cache
  }

  async function persist(next: Record<string, string>): Promise<void> {
    await mkdir(directory, { recursive: true })
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(next), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, file)
      cache = next
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }

  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  return {
    has: id => serialized(async () => id in await load()),
    get: id => serialized(async () => {
      const encrypted = (await load())[id]
      if (encrypted === undefined) return undefined
      if (!cipher.isEncryptionAvailable()) throw new SecretUnavailableError()
      return cipher.decryptString(Buffer.from(encrypted, 'base64'))
    }),
    set: (id, value) => serialized(async () => {
      if (!cipher.isEncryptionAvailable()) throw new SecretUnavailableError()
      const encrypted = cipher.encryptString(value).toString('base64')
      await persist({ ...await load(), [id]: encrypted })
    }),
    delete: id => serialized(async () => {
      const current = await load()
      if (!(id in current)) return
      const { [id]: _removed, ...rest } = current
      await persist(rest)
    }),
    retainOnly: keep => serialized(async () => {
      const current = await load()
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => keep.has(id)))
      if (Object.keys(next).length !== Object.keys(current).length) await persist(next)
    }),
    ids: () => serialized(async () => Object.keys(await load()))
  }
}
