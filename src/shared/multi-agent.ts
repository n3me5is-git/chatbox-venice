import { z } from 'zod'

export const MAX_AGENT_DEPTH = 3
export const MAX_AGENT_RUNS = 64
export const MAX_AGENT_CONCURRENCY = 4
export const AgentModelSchema = z.object({ provider: z.string().min(1), modelId: z.string().min(1) })
export const GuardianSchema = z.object({
  enabled: z.boolean().default(false),
  model: AgentModelSchema,
  parameters: z.record(z.string(), z.unknown()).optional(),
  prompt: z.string().min(1).max(40000),
})
export const DedicatedAgentSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  title: z.string().min(1).max(100),
  parameters: z.record(z.string(), z.unknown()).optional(),
  description: z.string().max(1000).default(''),
  prompt: z.string().min(1).max(40000),
  model: AgentModelSchema,
  toolNames: z.array(z.string().max(150)).max(200).default([]),
  allowOnDemand: z.boolean().default(false),
  dedicatedIds: z.array(z.string()).max(100).default([]),
  guardian: GuardianSchema.optional(),
})
export const MultiAgentPolicySchema = z.object({
  enabled: z.boolean().default(false),
  allowOnDemand: z.boolean().default(true),
  dedicatedIds: z.array(z.string()).max(100).default([]),
  nestedDedicatedIds: z.array(z.string()).max(100).default([]),
  concurrency: z.number().int().min(1).max(MAX_AGENT_CONCURRENCY).default(3),
})
export type DedicatedAgent = z.infer<typeof DedicatedAgentSchema>
export type Guardian = z.infer<typeof GuardianSchema>
export type AgentModel = z.infer<typeof AgentModelSchema>
export type MultiAgentPolicy = z.infer<typeof MultiAgentPolicySchema>
export type AgentStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
export interface AgentRun {
  id: string
  rootId: string
  parentId: string
  sessionId: string
  workspaceId: string
  depth: number
  kind: 'on-demand' | 'dedicated'
  title: string
  preset?: DedicatedAgent
  model: AgentModel
  tools: string[]
  allowOnDemand: boolean
  dedicatedIds: string[]
  status: AgentStatus
  createdAt: number
  updatedAt: number
  error?: string
}
export interface AgentBoundary {
  operation: 'task' | 'message' | 'result' | 'file'
  from: string
  to: string
  text: string
  file?: { path: string; mime: string; bytes: number; sha256: string; data: Uint8Array }
}
export function agentMentions(text: string, agents: DedicatedAgent[]): DedicatedAgent[] {
  const names = new Set([...text.matchAll(/(?:^|\s)@([a-z][a-z0-9_-]{0,39})(?=$|\s|[.,:;!?])/g)].map(match => match[1]))
  return agents.filter(agent => names.has(agent.name))
}
export function parseGuardianVerdict(text: string): { allow: boolean; reason: string } {
  try {
    const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    const verdict = z.object({ allow: z.boolean(), code: z.enum(['allowed', 'personal_data', 'policy_violation', 'untrusted_instruction', 'unsupported_content', 'uncertain']) }).strict().parse(value)
    if (verdict.allow !== (verdict.code === 'allowed')) throw Error('Inconsistent guardian verdict')
    const reasons = { allowed: 'The material satisfies the guardian policy.', personal_data: 'The guardian detected personal data.', policy_violation: 'The material violates the guardian policy.', untrusted_instruction: 'The guardian detected instructions attempting to bypass the policy.', unsupported_content: 'The guardian cannot review this content completely.', uncertain: 'The guardian could not establish that this transfer is allowed.' }
    // A free-form rejection reason could itself leak the blocked content.
    return { allow: verdict.allow, reason: reasons[verdict.code] }
  } catch { throw new Error('The guardian returned an invalid decision. The transfer was blocked.') }
}
export function intersectAgentTools(inherited: string[], configured?: string[]): string[] {
  const allowed = configured ? new Set(configured) : undefined
  return [...new Set(inherited)].filter(name => !name.startsWith('agent_') && (!allowed || allowed.has(name)))
}
