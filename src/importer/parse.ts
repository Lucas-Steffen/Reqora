import { parse as parseYaml, YAMLParseError } from 'yaml'
import { ImportError } from './errors'

export type SpecKind = 'openapi3' | 'swagger2'

export interface SpecInfo {
  kind: SpecKind
  /** The declared `openapi` or `swagger` version string. */
  version: string
}

/**
 * Parses JSON first, then YAML (JSON is valid YAML, but JSON.parse is faster and
 * gives clearer errors for JSON input). YAML aliases are capped to block
 * exponential "billion laughs" expansion.
 */
export function parseDocument(text: string): Record<string, unknown> {
  const source = text.replace(/^﻿/, '')
  if (!source.trim()) throw new ImportError('EMPTY', 'The document is empty.')
  let value: unknown
  const looksLikeJson = /^\s*[{[]/.test(source)
  try {
    value = JSON.parse(source)
  } catch (jsonError) {
    try {
      value = parseYaml(source, { maxAliasCount: 100, uniqueKeys: false, merge: true })
    } catch (yamlError) {
      if (looksLikeJson && jsonError instanceof SyntaxError) {
        // V8 messages can quote document text; report only the position.
        const position = /position (\d+)/.exec(jsonError.message)?.[1]
        throw new ImportError('PARSE', `The document is not valid JSON${position ? ` (character ${Number(position) + 1})` : ''}.`)
      }
      const where = yamlError instanceof YAMLParseError && yamlError.linePos
        ? ` (line ${yamlError.linePos[0].line}, column ${yamlError.linePos[0].col})`
        : ''
      throw new ImportError('PARSE', `The document is not valid JSON or YAML${where}.`)
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ImportError('NOT_OPENAPI', 'The document must be a JSON or YAML object with an "openapi" or "swagger" field.')
  }
  return value as Record<string, unknown>
}

export function detectSpec(document: Record<string, unknown>): SpecInfo {
  const openapi = document.openapi
  const swagger = document.swagger
  if (typeof openapi === 'string' || typeof openapi === 'number') {
    const version = String(openapi)
    if (/^3\.\d+(\.\d+)?/.test(version)) return { kind: 'openapi3', version }
    throw new ImportError('UNSUPPORTED_VERSION', `OpenAPI ${version} is not supported. Use OpenAPI 3.x or Swagger 2.0.`)
  }
  if (typeof swagger === 'string' || typeof swagger === 'number') {
    const version = String(swagger)
    if (version === '2.0' || version === '2') return { kind: 'swagger2', version: '2.0' }
    throw new ImportError('UNSUPPORTED_VERSION', `Swagger ${version} is not supported. Use OpenAPI 3.x or Swagger 2.0.`)
  }
  throw new ImportError('NOT_OPENAPI', 'This is not an OpenAPI 3.x or Swagger 2.0 document: no "openapi" or "swagger" version field was found.')
}
