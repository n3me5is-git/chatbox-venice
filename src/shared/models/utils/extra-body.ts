
import type { ModelDependencies } from '../../types/adapters'

export type ExtraBody = Record<string, unknown>

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function mergeExtraBody(body: Record<string, unknown>, extra: ExtraBody): Record<string, unknown> {
  const result = { ...body }
  for (const [key, value] of Object.entries(extra)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`Invalid JSON parameter: ${key}`)
    // The stream parser is selected before dispatch and must match the request.
    if (key === 'stream') throw new Error('Set streaming in Chatbox settings instead of the extra JSON')
    result[key] = isObject(value) && isObject(result[key]) ? mergeExtraBody(result[key], value) : value
  }
  return result
}

export function parseExtraBody(text: string): ExtraBody | undefined {
  if (!text.trim()) return undefined
  const value: unknown = JSON.parse(text)
  if (!isObject(value)) throw new Error('Enter a JSON object, for example {"moderation":"low"}')
  mergeExtraBody({}, value)
  return value
}

export function withExtraBody(dependencies: ModelDependencies, extra?: ExtraBody): ModelDependencies {
  if (!extra || Object.keys(extra).length === 0) return dependencies
  return {
    ...dependencies,
    request: {
      ...dependencies.request,
      apiRequest: (options) => {
        if (options.method?.toUpperCase() !== 'POST') return dependencies.request.apiRequest(options)
        if (typeof options.body === 'string') {
          let body: unknown
          try { body = JSON.parse(options.body) } catch { return dependencies.request.apiRequest(options) }
          if (isObject(body)) {
            return dependencies.request.apiRequest({ ...options, body: JSON.stringify(mergeExtraBody(body, extra)) })
          }
        }
        if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
          const body = new FormData()
          options.body.forEach((value, key) => body.append(key, value))
          for (const [key, value] of Object.entries(mergeExtraBody({}, extra))) {
            body.set(key, typeof value === 'string' ? value : JSON.stringify(value))
          }
          return dependencies.request.apiRequest({ ...options, body })
        }
        return dependencies.request.apiRequest(options)
      },
    },
  }
}
