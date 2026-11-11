import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider'
import { describe, expect, it } from 'vitest'
import { responsesToolDefaults } from './responses-tool-defaults'

describe('Responses tool schema defaults', () => {
  it.each(['stream', 'generate'] as const)('preserves provider tools and explicit strictness for %s', async type => {
    const params: LanguageModelV4CallOptions = { prompt: [], tools: [
      { type: 'function', name: 'mcp_tool', inputSchema: { type: 'object', properties: { optional: { type: 'string' } } } },
      { type: 'function', name: 'strict_tool', inputSchema: {}, strict: true },
      { type: 'function', name: 'loose_tool', inputSchema: {}, strict: false },
      { type: 'provider', id: 'openai.web_search', name: 'web_search', args: {} },
      { type: 'provider', id: 'openai.image_generation', name: 'image_generation', args: {} },
    ] }
    const before = structuredClone(params)
    const result = await responsesToolDefaults.transformParams!({ params, type, model: {} as LanguageModelV4 })
    expect(result.tools?.[0]).toMatchObject({ strict: false })
    expect(result.tools?.slice(1)).toEqual(params.tools?.slice(1))
    expect(params).toEqual(before)
  })
})
