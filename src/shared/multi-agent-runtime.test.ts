import { describe, expect, it, vi } from 'vitest'
import { MultiAgentRuntime, type AgentCaller, type AgentHost } from './multi-agent-runtime'
import { DedicatedAgentSchema, MultiAgentPolicySchema, agentMentions, parseGuardianVerdict, intersectAgentTools } from './multi-agent'

function fixture(concurrency = 3) {
  const policy = MultiAgentPolicySchema.parse({ enabled: true, dedicatedIds: ['dedicated'], nestedDedicatedIds: ['dedicated'], concurrency })
  const preset = DedicatedAgentSchema.parse({ id: 'dedicated', name: 'reviewer', title: 'Review', prompt: 'Review only explicit input', model: { provider: 'other', modelId: 'worker' }, toolNames: ['session_file'], allowOnDemand: true, dedicatedIds: ['dedicated'], guardian: { enabled: true, model: { provider: 'private', modelId: 'guard' }, prompt: 'No real names' } })
  const held = new Map<string, (text: string) => void>(), files = new Map<string, Uint8Array>()
  const host: AgentHost = {
    policy: vi.fn(async () => policy), preset: vi.fn(async id => id === preset.id ? preset : undefined), assertRoot: vi.fn(async () => {}),
    create: vi.fn(async (run, isolated, workspace) => ({ sessionId: 'session-' + run.id, workspaceId: isolated ? 'isolated-' + run.id : workspace })),
    save: vi.fn(async () => {}), execute: vi.fn((run) => new Promise(resolve => held.set(run.id, resolve))), guard: vi.fn(async () => ({ allow: true, reason: 'Allowed' })), append: vi.fn(async () => {}),
    readFile: vi.fn(async (id, path) => ({ bytes: new Uint8Array(files.get(id + ':' + path) || []), mime: 'text/plain' })), writeFile: vi.fn(async (id, path, bytes) => { files.set(id + ':' + path, new Uint8Array(bytes)) }), blocked: vi.fn(async () => {}),
  }
  const caller: AgentCaller = { id: 'root', rootId: 'root', workspaceId: 'root', depth: 0, model: { provider: 'venice', modelId: 'encrypted' }, tools: ['session_file', 'session_js', 'web_search'], allowOnDemand: true, dedicatedIds: ['dedicated'] }
  return { runtime: new MultiAgentRuntime(host), host, policy, preset, caller, held, files }
}
const task = { title: 'Research', task: 'Summarize this pseudonymous input' }
describe('multi-agent authority and privacy boundaries', () => {
  it('uses the same model and workspace for on-demand children; dedicated workers are isolated', async () => {
    const f = fixture(), shared = await f.runtime.spawn(f.caller, task), isolated = await f.runtime.spawn(f.caller, { ...task, dedicatedId: 'dedicated' })
    expect(shared.model).toEqual(f.caller.model); expect(shared.workspaceId).toBe('root')
    expect(isolated.workspaceId).not.toBe('root'); expect(isolated.model.provider).toBe('other'); expect(isolated.tools).toEqual(['session_file'])
  })
  it('rejects a fourth child level and disallows nested dedicated agents not explicitly exposed at the root', async () => {
    const f = fixture(), one = await f.runtime.spawn(f.caller, task), two = await f.runtime.spawn(f.runtime.caller(one), task), three = await f.runtime.spawn(f.runtime.caller(two), task)
    await expect(f.runtime.spawn(f.runtime.caller(three), task)).rejects.toThrow('three')
    f.policy.nestedDedicatedIds = []
    await expect(f.runtime.spawn(f.runtime.caller(one), { ...task, dedicatedId: 'dedicated' })).rejects.toThrow('not permitted')
  })
  it('respects dedicated definitions that forbid on-demand workers', async () => {
    const f = fixture(); f.preset.allowOnDemand = false
    const worker = await f.runtime.spawn(f.caller, { ...task, dedicatedId: 'dedicated' })
    await expect(f.runtime.spawn(f.runtime.caller(worker), task)).rejects.toThrow('not permitted')
  })
  it('reports a guardian block before creating a target session or starting its model', async () => {
    const f = fixture(); vi.mocked(f.host.guard).mockResolvedValue({ allow: false, reason: 'Real names are forbidden' })
    await expect(f.runtime.spawn(f.caller, { ...task, dedicatedId: 'dedicated' })).rejects.toThrow('Real names are forbidden')
    expect(f.host.create).not.toHaveBeenCalled(); expect(f.host.execute).not.toHaveBeenCalled(); expect(f.host.blocked).toHaveBeenCalled()
  })
  it('blocks a transfer when the guardian fails instead of silently permitting it', async () => {
    const f = fixture(); vi.mocked(f.host.guard).mockRejectedValue(Error('Invalid review'))
    await expect(f.runtime.spawn(f.caller, { ...task, dedicatedId: 'dedicated' })).rejects.toThrow('Invalid review')
    expect(f.host.create).not.toHaveBeenCalled()
  })
  it('reviews actual file bytes and copies exactly that reviewed snapshot', async () => {
    const f = fixture(), worker = await f.runtime.spawn(f.caller, { ...task, dedicatedId: 'dedicated' }); f.files.set('root:input.txt', new TextEncoder().encode('pseudonym 42'))
    const result = await f.runtime.transfer(f.caller, worker.id, 'to-agent', 'input.txt', 'data.txt')
    const boundary = vi.mocked(f.host.guard).mock.calls.at(-1)![1]
    expect(boundary.file?.sha256).toBe(result.sha256); expect(result.sha256).toHaveLength(64)
    expect(new TextDecoder().decode(f.files.get(worker.workspaceId + ':data.txt'))).toBe('pseudonym 42')
    expect(boundary.file?.data.every(byte => byte === 0)).toBe(true)
  })
  it('does not write rejected files and forbids traversal', async () => {
    const f = fixture(), worker = await f.runtime.spawn(f.caller, { ...task, dedicatedId: 'dedicated' })
    vi.mocked(f.host.guard).mockResolvedValue({ allow: false, reason: 'Private identifier' })
    await expect(f.runtime.transfer(f.caller, worker.id, 'to-agent', 'data.txt', 'worker.txt')).rejects.toThrow('Private identifier')
    expect(f.host.writeFile).not.toHaveBeenCalled()
    await expect(f.runtime.transfer(f.caller, worker.id, 'to-agent', '../secret', 'worker.txt')).rejects.toThrow()
  })
  it('checks result egress and prevents sibling access before reading content', async () => {
    const f = fixture(), first = await f.runtime.spawn(f.caller, { ...task, dedicatedId: 'dedicated' }), second = await f.runtime.spawn(f.caller, task), read = vi.fn(async () => 'result')
    await expect(f.runtime.result(f.runtime.caller(second), first.id, read)).rejects.toThrow('direct children'); expect(read).not.toHaveBeenCalled()
    vi.mocked(f.host.guard).mockResolvedValue({ allow: false, reason: 'Result contains a name' })
    await expect(f.runtime.result(f.caller, first.id, read)).rejects.toThrow('Result contains a name')
  })
  it('honors root revocation for already-created dedicated workers', async () => {
    const f = fixture(), worker = await f.runtime.spawn(f.caller, { ...task, dedicatedId: 'dedicated' })
    f.policy.dedicatedIds = []
    await expect(f.runtime.check(f.runtime.caller(worker))).rejects.toThrow('revoked')
  })
  it('limits execution and cancels a whole descendant tree', async () => {
    const f = fixture(1), a = await f.runtime.spawn(f.caller, task), b = await f.runtime.spawn(f.caller, task)
    await vi.waitFor(() => expect(f.host.execute).toHaveBeenCalledTimes(1)); expect(b.status).toBe('queued')
    await f.runtime.cancelTree(b.id); expect(b.status).toBe('cancelled')
    f.held.get(a.id)!('done'); await vi.waitFor(() => expect(a.status).toBe('completed')); expect(f.host.execute).toHaveBeenCalledTimes(1)
  })
  it('yields a waiting parent slot so nested execution does not deadlock at concurrency one', async () => {
    const f = fixture(1), parent = await f.runtime.spawn(f.caller, task)
    await vi.waitFor(() => expect(f.held.has(parent.id)).toBe(true))
    const child = await f.runtime.spawn(f.runtime.caller(parent), task), wait = f.runtime.wait(f.runtime.caller(parent), [child.id])
    await vi.waitFor(() => expect(f.held.has(child.id)).toBe(true)); f.held.get(child.id)!('done')
    await expect(wait).resolves.toEqual([{ id: child.id, status: 'completed' }]); expect(parent.status).toBe('running')
  })
  it('marks pending runs interrupted on reload instead of replaying paid tasks', async () => {
    const f = fixture(), saved = await f.runtime.spawn(f.caller, task), next = fixture()
    await next.runtime.restore([structuredClone(saved)]); expect(next.runtime.runs.get(saved.id)?.status).toBe('interrupted'); expect(next.host.execute).not.toHaveBeenCalled()
  })
  it('intersects tool grants and parses exact @mentions', () => {
    const f = fixture(); expect(intersectAgentTools(['session_file', 'web_search', 'agent_spawn'], ['session_file', 'run_command'])).toEqual(['session_file'])
    expect(agentMentions('Ask @reviewer, then continue', [f.preset])).toEqual([f.preset]); expect(agentMentions('x@reviewer or @reviewer2', [f.preset])).toEqual([])
  })
  it('requires an explicit, valid guardian verdict', () => {
    expect(parseGuardianVerdict('{"allow":true,"reason":"pseudonyms only"}').allow).toBe(true)
    for (const text of ['yes', '{"allow":"true","reason":"ok"}', '{"allow":true}', '{"allow":true,"reason":"ok","execute":true}']) expect(() => parseGuardianVerdict(text)).toThrow('blocked')
  })
})
