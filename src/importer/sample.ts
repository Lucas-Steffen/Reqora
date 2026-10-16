type Schema = Record<string, unknown>

const isSchema = (value: unknown): value is Schema => !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * Builds a representative value from an already dereferenced JSON Schema.
 * Precedence: example, examples[0], default, const, enum[0], then by type.
 */
export function sampleFromSchema(schema: unknown, depth = 0): unknown {
  if (!isSchema(schema) || depth > 8 || schema['x-circular'] || schema['x-unresolved']) return null
  if ('example' in schema) return schema.example
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0]
  if ('default' in schema) return schema.default
  if ('const' in schema) return schema.const
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map(part => sampleFromSchema(part, depth + 1))
    if (parts.every(part => isSchema(part))) return Object.assign({}, ...parts)
    return parts.find(part => part !== null) ?? null
  }
  for (const key of ['oneOf', 'anyOf'] as const) {
    const options = schema[key]
    if (Array.isArray(options) && options.length) return sampleFromSchema(options[0], depth + 1)
  }
  let type = schema.type
  if (Array.isArray(type)) type = type.find(item => item !== 'null') ?? type[0]
  if (!type) type = isSchema(schema.properties) ? 'object' : schema.items ? 'array' : undefined
  switch (type) {
    case 'object': {
      const result: Record<string, unknown> = {}
      if (isSchema(schema.properties)) {
        for (const [name, property] of Object.entries(schema.properties)) result[name] = sampleFromSchema(property, depth + 1)
      }
      return result
    }
    case 'array':
      return schema.items ? [sampleFromSchema(schema.items, depth + 1)] : []
    case 'integer':
    case 'number':
      return typeof schema.minimum === 'number' ? schema.minimum : 0
    case 'boolean':
      return true
    case 'string':
      return stringSample(schema.format)
    default:
      return null
  }
}

function stringSample(format: unknown): string {
  switch (format) {
    case 'date': return '2026-01-01'
    case 'date-time': return '2026-01-01T00:00:00Z'
    case 'email': return 'user@example.com'
    case 'uuid': return '00000000-0000-4000-8000-000000000000'
    case 'uri':
    case 'url': return 'https://example.com'
    default: return 'string'
  }
}

export function schemaTypeLabel(schema: unknown): string | undefined {
  if (!isSchema(schema)) return undefined
  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type
  if (typeof type !== 'string') return undefined
  return schema.format ? `${type} (${schema.format})` : type
}
