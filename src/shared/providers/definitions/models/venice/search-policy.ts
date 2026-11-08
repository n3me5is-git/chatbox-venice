import type { ToolSet } from 'ai'
import type { VeniceOptions } from './options'
import { isSearchPermitted } from './search-permissions'

export function effectiveVeniceSearch(settings: VeniceOptions): VeniceOptions {
  if (settings.webSearchEnabled === false || (settings.webSearch??'off')==='off') return { ...settings, webSearch: 'off', webScraping: false, xSearch: false }
  return settings
}

export const isSearchTool = (name: string) => /^(web_search|venice_web_search)(?:_(brave|google|exa))?$/.test(name)
const searchPath = (name: string) => name.startsWith('web_search') ? 'global' : 'venice'

/** One budget per answer, shared by the global and Venice search tools. */
export function guardSearchTools(tools: ToolSet, sessionId?: string) {
  const unavailable = new Set<string>()
  const results = new Map<string, Promise<unknown>>()
  let calls = 0
  const guarded = Object.fromEntries(Object.entries(tools).map(([name, definition]) => {
    if (!isSearchTool(name) || !definition.execute) return [name, definition]
    const execute = definition.execute as (input: any, context: any) => Promise<unknown>
    return [name, { ...definition, execute: async (input: any, context: any) => {
      if (!isSearchPermitted(sessionId, searchPath(name))) return { searchResults: [], error: 'The user disabled this search tool. Do not retry it.' }
      const query = typeof input?.query === 'string' ? input.query.trim().replace(/\s+/g, ' ').toLowerCase() : ''
      const key = `${name}:${query}`
      if (results.has(key)) {
        unavailable.add(name)
        return results.get(key)
      }
      if (calls >= 6 || unavailable.has(name)) return { searchResults: [], error: 'Search stopped for this answer. Use the results already available; do not retry this tool.' }
      calls++
      const result = Promise.resolve().then(() => execute(input, context)).catch(error => {
        unavailable.add(name)
        throw new Error(`Search unavailable for this answer: ${error instanceof Error ? error.message : 'request failed'}. Do not retry this tool; explain the limitation to the user.`)
      })
      results.set(key, result)
      return result
    } }]
  })) as ToolSet
  return { tools: guarded, active: (names: string[]) => names.filter(name => !isSearchTool(name) || calls < 6 && !unavailable.has(name) && isSearchPermitted(sessionId, searchPath(name))) }
}
