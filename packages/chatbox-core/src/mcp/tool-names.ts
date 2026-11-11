import type { ToolSet } from 'ai'

export type MCPToolGroup = { serverId: string; server: string; tools: ToolSet }

function legacyName(server: string, tool: string): string {
  const prefix = server.replace(/\s+/g, '_')
  return /^[A-Za-z0-9_-]+$/.test(prefix) ? `mcp__${prefix.toLowerCase()}__${tool}` : `mcp__${tool}`
}

// Routing identifier, not a security hash. Collisions are resolved below.
function nameHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Preserve established names when possible; never let one server replace another.
 * Renaming changes only the model-facing key. The controller retains the original
 * execution closure and its server permission/lifecycle checks. */
export function flattenMCPToolGroups(groups: readonly MCPToolGroup[]): ToolSet {
  const entries = groups.flatMap(group => Object.entries(group.tools).map(([toolName, tool]) => ({
    ...group, toolName, tool, base: legacyName(group.server, toolName), identity: JSON.stringify([group.serverId, toolName]),
  }))).sort((a, b) => a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0)
  const counts = new Map<string, number>()
  const identities = new Set<string>()
  for (const entry of entries) {
    if (identities.has(entry.identity)) throw new Error('Duplicate MCP server/tool identity')
    identities.add(entry.identity)
    counts.set(entry.base, (counts.get(entry.base) ?? 0) + 1)
  }
  const reserved = new Set(entries.map(entry => entry.base))
  const assigned = new Set<string>()
  const result: ToolSet = {}
  for (const entry of entries) {
    let name = entry.base
    const renamed = counts.get(name)! > 1 || !/^[A-Za-z0-9_-]{1,64}$/.test(name)
    if (renamed) {
      const stem = name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 55)
      let attempt = 0
      do { name = `${stem}_${nameHash(JSON.stringify([entry.serverId, entry.toolName, attempt++]))}` }
      while (reserved.has(name) || assigned.has(name))
    }
    assigned.add(name)
    if (!renamed) { result[name] = entry.tool; continue }
    const prefix = `[MCP server: ${entry.server}] `
    const original = entry.tool.description
    const description: typeof original = typeof original === 'function'
      ? options => (prefix + original(options)).trimEnd()
      : (prefix + (original ?? '')).trimEnd()
    result[name] = { ...entry.tool, description } as ToolSet[string]
  }
  return result
}
