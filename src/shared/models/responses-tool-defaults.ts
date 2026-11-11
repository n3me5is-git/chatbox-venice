import type { LanguageModelV4Middleware } from '@ai-sdk/provider'

/** MCP and built-in tool schemas are not necessarily strict schemas. Respect
 * explicit choices and provider-defined tools (search/images) independently. */
export const responsesToolDefaults: LanguageModelV4Middleware = {
  specificationVersion: 'v4',
  transformParams: async ({ params }) => {
    if (!params.tools?.some(tool => tool.type === 'function' && tool.strict == null)) return params
    return { ...params, tools: params.tools.map(tool => tool.type === 'function' && tool.strict == null ? { ...tool, strict: false } : tool) }
  },
}
