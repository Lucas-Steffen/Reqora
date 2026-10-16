import { HTTP_METHODS, type HttpMethod, type KeyValue, type RequestBody, type ResponseSpec } from '../workspace/types'
import { ImportError } from './errors'
import { detectSpec, type SpecKind } from './parse'
import { DEFAULT_REF_LIMITS, loadDocumentSet, RefResolver, type ReferenceLoader, type RefLimits } from './refs'
import { sampleFromSchema, schemaTypeLabel } from './sample'

type Json = unknown
type Obj = Record<string, Json>
const isObj = (value: Json): value is Obj => !!value && typeof value === 'object' && !Array.isArray(value)
const str = (value: Json): string | undefined => typeof value === 'string' && value.trim() ? value : undefined

export interface ImportedParameter {
  name: string
  in: 'query' | 'header' | 'path' | 'cookie'
  required: boolean
  description?: string
  example?: string
}

export interface ImportedOperation {
  method: HttpMethod
  path: string
  summary?: string
  description?: string
  operationId?: string
  tags: string[]
  deprecated: boolean
  parameters: ImportedParameter[]
  body: RequestBody
  responses: ResponseSpec[]
  /** Security requirement alternatives; each entry lists scheme names applied together. Undefined = inherit document default. */
  security?: string[][]
}

export interface ImportedSchema {
  name: string
  description?: string
  content: string
}

/** Grouping-independent, serializable result of reading one document. */
export interface ImportedSpec {
  kind: SpecKind
  specVersion: string
  title: string
  version?: string
  description?: string
  servers: string[]
  tags: { name: string; description?: string }[]
  operations: ImportedOperation[]
  schemas: ImportedSchema[]
  securitySchemes: Record<string, Obj>
  /** Document-level security requirements. */
  security: string[][]
  warnings: string[]
}

export interface ReadSpecOptions {
  /** Absolute URI of the root document (file: or http(s):), for relative $ref resolution. */
  uri: string
  loader: ReferenceLoader
  limits?: RefLimits
}

const LOWER_METHODS = HTTP_METHODS.map(method => method.toLowerCase())

function stringify(value: Json): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return undefined }
}

function scalarExample(value: Json): string | undefined {
  if (value === undefined || value === null) return undefined
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function securityList(value: Json): string[][] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter(isObj).map(requirement => Object.keys(requirement))
}

function serverUrls(kind: SpecKind, document: Obj): string[] {
  if (kind === 'swagger2') {
    const host = str(document.host)
    const basePath = str(document.basePath) ?? ''
    if (!host) return basePath && basePath !== '/' ? [basePath] : []
    const schemes = Array.isArray(document.schemes) && document.schemes.length ? document.schemes : ['https']
    return [`${schemes[0]}://${host}${basePath === '/' ? '' : basePath}`]
  }
  if (!Array.isArray(document.servers)) return []
  return document.servers.filter(isObj).flatMap(server => {
    let url = str(server.url)
    if (!url) return []
    // Substitute server variables with their defaults.
    if (isObj(server.variables)) {
      for (const [name, variable] of Object.entries(server.variables)) {
        const fallback = isObj(variable) ? scalarExample(variable.default) : undefined
        if (fallback !== undefined) url = url.split(`{${name}}`).join(fallback)
      }
    }
    return [url.replace(/\/$/, '')]
  })
}

/** Reads, dereferences and normalizes an OpenAPI 3.x or Swagger 2.0 document. */
export async function readSpec(document: Obj, options: ReadSpecOptions): Promise<ImportedSpec> {
  const { kind, version: specVersion } = detectSpec(document)
  const set = await loadDocumentSet(options.uri, document, options.loader, options.limits ?? DEFAULT_REF_LIMITS)
  const resolver = new RefResolver(set)
  const uri = options.uri
  const info = isObj(document.info) ? document.info : {}
  const title = str(info.title) ?? 'Imported API'
  const paths = resolver.resolve(document.paths, uri)
  if (!paths || !isObj(paths.value)) {
    if (document.paths !== undefined) throw new ImportError('NOT_OPENAPI', 'The "paths" field must be an object.')
  }
  const globalConsumes = Array.isArray(document.consumes) ? document.consumes.filter((item): item is string => typeof item === 'string') : []
  const globalProduces = Array.isArray(document.produces) ? document.produces.filter((item): item is string => typeof item === 'string') : []
  const operations: ImportedOperation[] = []

  for (const [path, rawItem] of Object.entries(paths && isObj(paths.value) ? paths.value : {})) {
    if (!path.startsWith('/')) continue
    const item = resolver.resolve(rawItem, paths!.uri)
    if (!item || !isObj(item.value)) continue
    const pathParameters = Array.isArray(item.value.parameters) ? item.value.parameters : []
    for (const [methodKey, rawOperation] of Object.entries(item.value)) {
      const index = LOWER_METHODS.indexOf(methodKey.toLowerCase())
      if (index === -1 || !isObj(rawOperation)) continue
      const operation = resolver.deref(rawOperation, item.uri) as Obj
      const inherited = resolver.deref(pathParameters, item.uri) as Json[]
      operations.push(convertOperation(kind, HTTP_METHODS[index], path, operation, inherited, globalConsumes, globalProduces))
    }
  }

  const schemaContainer = kind === 'swagger2' ? document.definitions : isObj(document.components) ? document.components.schemas : undefined
  const schemas: ImportedSchema[] = isObj(schemaContainer)
    ? Object.entries(schemaContainer).map(([name, schema]) => {
      const expanded = resolver.deref(schema, uri, 12)
      return { name, description: isObj(expanded) ? str(expanded.description) : undefined, content: stringify(expanded) ?? '{}' }
    })
    : []

  const rawSchemes = kind === 'swagger2' ? document.securityDefinitions : isObj(document.components) ? document.components.securitySchemes : undefined
  const securitySchemes: Record<string, Obj> = {}
  if (isObj(rawSchemes)) {
    for (const [name, scheme] of Object.entries(rawSchemes)) {
      const expanded = resolver.deref(scheme, uri)
      if (isObj(expanded)) securitySchemes[name] = expanded
    }
  }

  return {
    kind,
    specVersion,
    title,
    version: str(info.version),
    description: str(info.description),
    servers: serverUrls(kind, document),
    tags: Array.isArray(document.tags)
      ? document.tags.filter(isObj).flatMap(tag => str(tag.name) ? [{ name: str(tag.name)!, description: str(tag.description) }] : [])
      : [],
    operations,
    schemas,
    securitySchemes,
    security: securityList(document.security) ?? [],
    warnings: [...set.warnings, ...resolver.warnings]
  }
}

function convertOperation(
  kind: SpecKind,
  method: HttpMethod,
  path: string,
  operation: Obj,
  inheritedParameters: Json[],
  globalConsumes: string[],
  globalProduces: string[]
): ImportedOperation {
  // Operation parameters override path-level ones with the same name+location.
  const merged = new Map<string, Obj>()
  for (const parameter of [...inheritedParameters, ...(Array.isArray(operation.parameters) ? operation.parameters : [])]) {
    if (isObj(parameter) && str(parameter.name) && str(parameter.in)) merged.set(`${parameter.in}:${parameter.name}`, parameter)
  }
  const parameters: ImportedParameter[] = []
  let body: RequestBody = { mode: 'none' }
  const formFields: KeyValue[] = []
  const consumes = Array.isArray(operation.consumes) ? operation.consumes.filter((item): item is string => typeof item === 'string') : globalConsumes

  for (const parameter of merged.values()) {
    const location = parameter.in as string
    if (kind === 'swagger2' && location === 'body') {
      const contentType = consumes.find(type => type.includes('json')) ?? consumes[0] ?? 'application/json'
      body = rawBody(contentType, parameter.schema ? sampleFromSchema(parameter.schema) : undefined)
      continue
    }
    if (kind === 'swagger2' && location === 'formData') {
      formFields.push({ key: parameter.name as string, value: scalarExample(parameter.default ?? parameter['x-example']) ?? '', enabled: true, description: str(parameter.description) })
      continue
    }
    if (!['query', 'header', 'path', 'cookie'].includes(location)) continue
    const schema = kind === 'swagger2' ? parameter : parameter.schema
    const example = parameter.example ?? (isObj(parameter.examples) ? firstExample(parameter.examples) : undefined) ??
      (isObj(schema) ? (schema.example ?? schema.default ?? (Array.isArray(schema.enum) ? schema.enum[0] : undefined)) : undefined) ??
      parameter['x-example']
    const typeLabel = schemaTypeLabel(schema)
    parameters.push({
      name: parameter.name as string,
      in: location as ImportedParameter['in'],
      required: location === 'path' || parameter.required === true,
      description: str(parameter.description) ?? typeLabel,
      example: scalarExample(example)
    })
  }

  if (formFields.length) {
    body = { mode: consumes.includes('multipart/form-data') ? 'form-data' : 'form-urlencoded', form: formFields, contentType: consumes[0] }
  }
  if (kind === 'openapi3' && isObj(operation.requestBody) && isObj(operation.requestBody.content)) {
    body = openApiBody(operation.requestBody.content)
  }

  const responses: ResponseSpec[] = []
  if (isObj(operation.responses)) {
    const produces = Array.isArray(operation.produces) ? operation.produces.filter((item): item is string => typeof item === 'string') : globalProduces
    for (const [status, response] of Object.entries(operation.responses)) {
      if (!isObj(response)) continue
      if (kind === 'swagger2') {
        const examples = isObj(response.examples) ? response.examples : {}
        const contentType = Object.keys(examples)[0] ?? produces.find(type => type.includes('json')) ?? produces[0]
        const example = examples[contentType ?? ''] ?? (response.schema ? sampleFromSchema(response.schema) : undefined)
        responses.push({ status, description: str(response.description), contentType: response.schema || Object.keys(examples).length ? contentType : undefined, example: stringify(example) })
      } else {
        const content = isObj(response.content) ? response.content : {}
        const contentType = pickContentType(Object.keys(content))
        const media = contentType ? content[contentType] : undefined
        const example = isObj(media) ? mediaExample(media) : undefined
        responses.push({ status, description: str(response.description), contentType, example: stringify(example) })
      }
    }
  }

  const tags = Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim()) : []
  return {
    method,
    path,
    summary: str(operation.summary),
    description: str(operation.description),
    operationId: str(operation.operationId),
    tags,
    deprecated: operation.deprecated === true,
    parameters,
    body,
    responses,
    security: securityList(operation.security)
  }
}

function firstExample(examples: Obj): Json {
  const first = Object.values(examples)[0]
  return isObj(first) ? first.value : undefined
}

function mediaExample(media: Obj): Json {
  if (media.example !== undefined) return media.example
  if (isObj(media.examples)) {
    const value = firstExample(media.examples)
    if (value !== undefined) return value
  }
  return media.schema ? sampleFromSchema(media.schema) : undefined
}

function pickContentType(types: string[]): string | undefined {
  return types.find(type => /^application\/(.+\+)?json/.test(type)) ?? types[0]
}

function rawBody(contentType: string, example: Json): RequestBody {
  const mode = /json/.test(contentType) ? 'json' : /xml/.test(contentType) ? 'xml' : 'text'
  return { mode, raw: example === undefined || example === null ? '' : stringify(example) ?? '', contentType }
}

function openApiBody(content: Obj): RequestBody {
  const contentType = pickContentType(Object.keys(content))
  if (!contentType) return { mode: 'none' }
  const media = isObj(content[contentType]) ? content[contentType] as Obj : {}
  if (contentType === 'application/x-www-form-urlencoded' || contentType.startsWith('multipart/form-data')) {
    const schema = isObj(media.schema) ? media.schema : {}
    const example = mediaExample(media)
    const properties = isObj(schema.properties) ? schema.properties : {}
    const form = Object.entries(properties).map(([key, property]) => ({
      key,
      value: scalarExample(isObj(example) ? example[key] : undefined) ?? '',
      enabled: true,
      description: isObj(property) ? str(property.description) : undefined
    }))
    return { mode: contentType.startsWith('multipart') ? 'form-data' : 'form-urlencoded', form, contentType }
  }
  return rawBody(contentType, mediaExample(media))
}
