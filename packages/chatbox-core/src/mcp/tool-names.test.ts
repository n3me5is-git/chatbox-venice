import { describe, expect, it, vi } from 'vitest'
import { flattenMCPToolGroups, type MCPToolGroup } from './tool-names'

const group = (serverId: string, server: string, toolName = 'read'): MCPToolGroup => ({
  serverId, server, tools: { [toolName]: { description: 'Read a document', inputSchema: {} as never, execute: vi.fn(async () => serverId) } },
})

describe('MCP tool routing names', () => {
  it('preserves existing unique names and execution identity', () => {
    const first = group('one', 'My Server')
    expect(flattenMCPToolGroups([first])).toEqual({ mcp__my_server__read: first.tools.read })
  })
  it('routes normalized collisions to the original servers, independent of order', async () => {
    const groups = [group('one', 'Same Name'), group('two', 'Same_Name')]
    const combined = flattenMCPToolGroups(groups)
    expect(Object.keys(combined)).toEqual(Object.keys(flattenMCPToolGroups([...groups].reverse())))
    expect(Object.keys(combined)).toHaveLength(2)
    const outputs = await Promise.all(Object.values(combined).map(tool => tool.execute!({}, {} as never)))
    expect(outputs).toEqual(['one', 'two'])
    expect(Object.values(combined).every(tool => typeof tool.description === 'string' && tool.description.includes('[MCP server:'))).toBe(true)
  })
  it('makes non-ASCII collisions, long names and invalid tool names API-safe', () => {
    const tools = flattenMCPToolGroups([group('a', '日本語'), group('b', '中文'), group('c', 'x'.repeat(100), 'read.file')])
    expect(Object.keys(tools)).toHaveLength(3)
    expect(Object.keys(tools).every(name => /^[A-Za-z0-9_-]{1,64}$/.test(name))).toBe(true)
  })
  it('retains dynamic descriptions and their calling context when renaming', () => {
    const first = group('a', 'same')
    first.tools.read.description = ({ context }) => `Read ${context.folder}`
    const tools = flattenMCPToolGroups([first, group('b', 'same')])
    const description = Object.values(tools)[0].description
    if (typeof description !== 'function') throw new Error('Dynamic description was lost')
    expect(description({ context: { folder: 'invoices' } })).toBe('[MCP server: same] Read invoices')
  })
  it('does not overwrite a legitimate tool whose name matches a generated suffix', () => {
    const groups = [group('a', 'same'), group('b', 'same')]
    const existing = Object.keys(flattenMCPToolGroups(groups))[0]
    const matching = group('c', 'same', existing.slice('mcp__same__'.length))
    const combined = flattenMCPToolGroups([...groups, matching])
    expect(Object.keys(combined)).toHaveLength(3)
    expect(combined[existing]).toBe(matching.tools[Object.keys(matching.tools)[0]])
    expect(combined).toEqual(flattenMCPToolGroups([matching, ...groups.reverse()]))
  })
})
