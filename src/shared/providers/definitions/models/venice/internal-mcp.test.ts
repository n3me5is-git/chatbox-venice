import { describe, expect, it } from 'vitest'
import { internalVeniceMCP } from './internal-mcp'
import { validatedToolSchema } from '../../../../validated-tool-schema'
describe('in-process Venice MCP transport', () => {
  it('routes a tool through MCP without a port, subprocess or remote relay', async () => {
    const tools = internalVeniceMCP({ example: { description: 'test', inputSchema: validatedToolSchema({ type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }), execute: async (raw: unknown) => ({ result: (raw as { value: string }).value }) } })
    expect(await tools.example.execute!({ value: 'local' }, { toolCallId: 'call', messages: [] })).toEqual({ result: 'local' })
  })
  it('propagates original failures and cancellation without replaying the request', async () => {
    let calls = 0
    const tools = internalVeniceMCP({ example: { inputSchema: validatedToolSchema({ type: 'object' }), execute: async () => { calls++; throw new Error('original failure') } } })
    await expect(tools.example.execute!({}, { toolCallId: 'call', messages: [] })).rejects.toThrow('original failure'); expect(calls).toBe(1)
    const abort = new AbortController(); abort.abort(); await expect(tools.example.execute!({}, { toolCallId: 'call2', messages: [], abortSignal: abort.signal })).rejects.toThrow(); expect(calls).toBe(1)
  })
})
