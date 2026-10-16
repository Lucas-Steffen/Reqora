export type ImportErrorCode =
  | 'EMPTY'
  | 'PARSE'
  | 'NOT_OPENAPI'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_URL'
  | 'UNSUPPORTED_SCHEME'
  | 'TIMEOUT'
  | 'TOO_LARGE'
  | 'TOO_MANY_REDIRECTS'
  | 'HTTP_STATUS'
  | 'NETWORK'
  | 'FILE'
  | 'LIMIT'
  | 'CANCELED'
  | 'UNEXPECTED'

/** Serializable import failure. Messages are user-facing and never echo document contents or credentials. */
export interface ImportFailure {
  code: ImportErrorCode
  message: string
}

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode, message: string) {
    super(message)
    this.name = 'ImportError'
  }

  toJSON(): ImportFailure {
    return { code: this.code, message: this.message }
  }
}

export function toImportFailure(error: unknown): ImportFailure {
  if (error instanceof ImportError) return error.toJSON()
  return { code: 'UNEXPECTED', message: 'The document could not be imported because of an unexpected error.' }
}

/** Removes user info, query and fragment so URLs can be shown and stored safely. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    const hadQuery = !!url.search
    url.search = ''
    url.hash = ''
    return url.toString() + (hadQuery ? '?…' : '')
  } catch {
    return '(invalid URL)'
  }
}
