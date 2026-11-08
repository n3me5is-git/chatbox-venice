import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { AgentCaller, MultiAgentRuntime } from './multi-agent-runtime'
import type { DedicatedAgent } from './multi-agent'
import type { LocalMCPGrant } from './local-mcp'
import { localMCPAllows } from './local-mcp'
import { createAgentTools } from './multi-agent-tools'

export interface ExternalAgentContext { caller: AgentCaller; owned: Set<string> }
export interface ExternalAgentAccess {
  acquire(): Promise<ExternalAgentContext>
  assert(): Promise<void>
  catalog(): Promise<DedicatedAgent[]>
  readResult(id: string): Promise<string>
  listFiles?(id: string): Promise<unknown>
}
/** The external caller is always the root orchestrator, never an arbitrary child identity. */
export function createLocalMCPAgentTools(grant: LocalMCPGrant, runtime: MultiAgentRuntime, access: ExternalAgentAccess): ToolSet {
  if (!grant.permissions.multiAgent) return {}
  const safe = (work: () => Promise<unknown>) => work().catch(error => ({ blocked: true, error: String((error as Error).message) }))
  // Only the schemas are used here; acquisition happens when a tool is executed, not on tools/list.
  const shape = createAgentTools(runtime, {} as AgentCaller, access.readResult, access.listFiles)
  const tools: ToolSet = {}
  for (const [name, definition] of Object.entries(shape)) {
    if (!localMCPAllows(grant.permissions, name)) continue
    tools[name] = { ...definition, execute: (input: any, options) => safe(async () => {
      options.abortSignal?.throwIfAborted()
      const context = await access.acquire()
      if (input.id && !context.owned.has(input.id) || input.ids?.some((id: string) => !context.owned.has(id))) throw Error('Only direct workers created by this MCP sharing grant can be controlled')
      const member = createAgentTools(runtime, context.caller, access.readResult, access.listFiles)[name]
      const result: any = await member.execute!(input, options)
      if (name === 'agent_spawn' && result?.id) context.owned.add(result.id)
      await access.assert(); options.abortSignal?.throwIfAborted()
      if (name === 'agent_status' && Array.isArray(result)) return result.filter(run => context.owned.has(run.id))
      return result
    }) }
  }
  tools.agent_catalog = tool({ description: 'List dedicated agents permitted by this Work chat, their models, tool names and guardian presence. Does not expose prompts, credentials or disabled agents. Does not start a worker or enable permissions.', inputSchema: z.object({}).strict(), execute: () => safe(async () => {
    const { caller } = await access.acquire()
    const agents = (await access.catalog()).filter(agent => caller.dedicatedIds.includes(agent.id))
    await access.assert()
    return agents.map(agent => ({ id: agent.id, name: agent.name, title: agent.title, description: agent.description, model: agent.model, tools: agent.toolNames.filter(name => caller.tools.includes(name)), guardian: agent.guardian?.enabled === true, allowOnDemand: caller.allowOnDemand && agent.allowOnDemand }))
  }) })
  tools.agent_tree = tool({ description: 'Show execution metadata for this Work chat’s complete agent tree, including nested workers and their sandbox IDs. No transcripts, system prompts or file contents. Controllable marks direct workers created by this MCP grant; descendants remain managed by their own caller.', inputSchema: z.object({}).strict(), execute: () => safe(async () => {
    const context = await access.acquire(); await runtime.check(context.caller)
    const tree = [...runtime.runs.values()].filter(run => run.rootId === grant.sessionId).map(run => ({ id: run.id, parentId: run.parentId, sessionId: run.sessionId, workspaceId: run.workspaceId, depth: run.depth, title: run.title, kind: run.kind, model: run.model, status: run.status, guardian: run.preset?.guardian?.enabled === true, controllable: context.owned.has(run.id), createdAt: run.createdAt, updatedAt: run.updatedAt }))
    await access.assert(); return { rootId: grant.sessionId, maxDepth: 3, runs: tree }
  }) })
  return tools
}
