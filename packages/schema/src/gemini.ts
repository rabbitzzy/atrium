/**
 * Gemini's schema dialect is an OpenAPI subset: uppercase type names, and
 * `nullable` instead of a union with null. It is close enough to JSON Schema
 * to be confusing, so apps declare schemas in this shape directly rather than
 * converting.
 *
 * The transport that sends these lives in the platform. Only the shape is
 * shared, because an app has to be able to declare its extraction schema
 * without reaching into `api/_lib`.
 */
export interface GeminiSchema {
  type: 'OBJECT' | 'ARRAY' | 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN'
  properties?: Record<string, GeminiSchema>
  items?: GeminiSchema
  required?: string[]
  propertyOrdering?: string[]
  nullable?: boolean
  enum?: string[]
  description?: string
}
