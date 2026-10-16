import { readSpec, type ImportedSpec } from './convert'
import { parseDocument } from './parse'
import type { ReferenceLoader, RefLimits } from './refs'

export * from './errors'
export type { ImportedSpec, ImportedOperation, ImportedParameter, ImportedSchema } from './convert'
export * from './plan'

/** Parse + dereference + normalize one document. Pure apart from the injected loader. */
export async function importDocument(text: string, uri: string, loader: ReferenceLoader, limits?: RefLimits): Promise<ImportedSpec> {
  return readSpec(parseDocument(text), { uri, loader, limits })
}
