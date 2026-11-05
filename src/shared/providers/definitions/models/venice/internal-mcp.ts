import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ToolSet } from 'ai'
/** An in-process MCP pair. No subprocess, listening port, relay or credentials in MCP arguments. */
export function internalVeniceMCP(tools: ToolSet): ToolSet {
  return Object.fromEntries(Object.entries(tools).map(([name, tool]) => [name, { ...tool,
    execute: async (input: unknown, context: Parameters<NonNullable<typeof tool.execute>>[1]) => {
      const server = new Server({ name: 'venice-local', version: '1.0.0' }, { capabilities: { tools: {} } })
      const client = new Client({ name: 'chatbox-venice', version: '1.0.0' })
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      let failed: unknown; let output: unknown
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name, description: tool.description, inputSchema: (tool.inputSchema as { jsonSchema: { type: 'object' } }).jsonSchema }] }))
      server.setRequestHandler(CallToolRequestSchema, async request => {
        if (request.params.name !== name || !tool.execute) throw new Error('Unknown Venice tool')
        try { context.abortSignal?.throwIfAborted(); output = await tool.execute(request.params.arguments, context); return { content: [{ type: 'text', text: JSON.stringify(output ?? null) }] } }
        catch (error) { failed = error; return { isError: true, content: [{ type: 'text', text: 'Venice tool failed' }] } }
      })
      try {
        await server.connect(serverTransport); await client.connect(clientTransport)
        await client.callTool({ name, arguments: input as Record<string, unknown> }, undefined, { signal: context.abortSignal, timeout: 20 * 60 * 1000 })
        if (failed) throw failed
        return output
      } finally { await Promise.allSettled([client.close(), server.close()]) }
    },
  }]))
}
