import { MAX_AGENT_DEPTH, MAX_AGENT_RUNS, intersectAgentTools, type AgentBoundary, type AgentModel, type AgentRun, type DedicatedAgent, type Guardian, type MultiAgentPolicy } from './multi-agent'
import { sessionFilePath } from './session-resources'

export interface AgentCaller { id: string; rootId: string; workspaceId: string; depth: number; model: AgentModel; tools: string[]; allowOnDemand: boolean; dedicatedIds: string[] }
export interface AgentHost {
  policy(rootId: string): Promise<MultiAgentPolicy>
  preset(id: string): Promise<DedicatedAgent | undefined>
  assertRoot(rootId: string): Promise<void>
  assertCaller?(caller: AgentCaller): Promise<void>
  create(run: Omit<AgentRun, 'sessionId' | 'workspaceId'>, isolated: boolean, workspaceId: string): Promise<{ sessionId: string; workspaceId: string }>
  save(run: AgentRun): Promise<void>
  execute(run: AgentRun, task: string, signal: AbortSignal): Promise<string>
  guard(guardian: Guardian, boundary: AgentBoundary, signal?: AbortSignal): Promise<{ allow: boolean; reason: string }>
  blocked?(run: AgentRun, boundary: AgentBoundary, reason: string): Promise<void>
  append(run: AgentRun, message: string): Promise<void>
  readFile(workspaceId: string, path: string): Promise<{ bytes: Uint8Array; mime: string }>
  writeFile(workspaceId: string, path: string, bytes: Uint8Array, mime: string): Promise<void>
}

/** Authority lives in the host, never in generated prompts or tool arguments. */
export class MultiAgentRuntime {
  readonly runs = new Map<string, AgentRun>()
  private active = new Map<string, AbortController>()
  private queue: Array<{ run: AgentRun; text: string }> = []
  private listeners = new Set<() => void>()
  private rootsStopping = new Set<string>()
  private pendingSpawns = new Map<string, number>()
  private pendingMessages = new Set<string>()
  constructor(private readonly host: AgentHost) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private notify() { for (const listener of this.listeners) listener() }
  async restore(runs: AgentRun[]) {
    for (const saved of runs) {
      const run = { ...saved }
      if (['queued', 'running', 'waiting'].includes(run.status)) { run.status = 'interrupted'; run.error = 'The app stopped. Send an explicit follow-up to resume.'; await this.host.save(run) }
      this.runs.set(run.id, run)
    }
    this.notify()
  }
  private async authorize(caller: AgentCaller) {
    if (this.rootsStopping.has(caller.rootId)) throw new Error('This agent workspace is stopping')
    await this.host.assertRoot(caller.rootId)
    await this.host.assertCaller?.(caller)
    const policy = await this.host.policy(caller.rootId)
    if (!policy.enabled) throw new Error('Multi-agent mode is disabled for this Work chat')
    if (caller.id !== caller.rootId) {
      const run = this.runs.get(caller.id)
      if (!run || run.rootId !== caller.rootId || ['cancelled', 'interrupted'].includes(run.status)) throw new Error('The calling agent is no longer authorized')
      for (let node: AgentRun | undefined = run; node; node = this.runs.get(node.parentId)) {
        if (node.preset && (!policy.dedicatedIds.includes(node.preset.id) || node.depth > 1 && !policy.nestedDedicatedIds.includes(node.preset.id))) throw new Error('This dedicated agent permission was revoked')
        if (node.preset && !await this.host.preset(node.preset.id)) throw new Error('This dedicated agent was removed')
      }
    }
    return policy
  }
  private async boundary(caller: AgentCaller, run: AgentRun, value: AgentBoundary, signal?: AbortSignal) {
    await this.authorize(caller)
    const guardians: Guardian[] = []
    for (const start of [this.runs.get(caller.id), run]) {
      for (let node = start; node; node = this.runs.get(node.parentId)) {
        if (!node.preset) continue
        for (const guard of [node.preset.guardian, (await this.host.preset(node.preset.id))?.guardian]) if (guard?.enabled) guardians.push(guard)
      }
    }
    const unique = [...new Map(guardians.map(guard => [JSON.stringify(guard), guard])).values()]
    for (const guard of unique) {
      signal?.throwIfAborted()
      try {
        const verdict = await this.host.guard(guard, value, signal)
        if (!verdict.allow) throw new Error('Guardian blocked the transfer: ' + verdict.reason)
      } catch (error) { await this.host.blocked?.(run, value, String((error as Error).message)); this.notify(); throw error }
    }
    signal?.throwIfAborted()
    await this.authorize(caller)
  }
  private owned(caller: AgentCaller, id: string) {
    const run = this.runs.get(id)
    if (!run || run.rootId !== caller.rootId || run.parentId !== caller.id) throw new Error('Agents can access only their own direct children')
    return run
  }
  async spawn(caller: AgentCaller, input: { task: string; title: string; dedicatedId?: string }, signal?: AbortSignal) {
    const policy = await this.authorize(caller)
    if (caller.depth >= MAX_AGENT_DEPTH) throw new Error('Maximum agent nesting depth is three')
    if ([...this.runs.values()].filter(run => run.rootId === caller.rootId).length + (this.pendingSpawns.get(caller.rootId) || 0) >= MAX_AGENT_RUNS) throw new Error('Agent run limit reached. Start a new Work chat.')
    this.pendingSpawns.set(caller.rootId, (this.pendingSpawns.get(caller.rootId) || 0) + 1)
    try {
    const preset = input.dedicatedId ? await this.host.preset(input.dedicatedId) : undefined
    if (input.dedicatedId && (!preset || !policy.dedicatedIds.includes(preset.id) || !caller.dedicatedIds.includes(preset.id) || caller.depth > 0 && !policy.nestedDedicatedIds.includes(preset.id))) throw new Error('This dedicated agent is not permitted at this depth')
    if (!preset && (!policy.allowOnDemand || !caller.allowOnDemand)) throw new Error('On-demand agents are not permitted by the inherited policy')
    if (!input.task.trim() || input.task.length > 100000) throw new Error('Provide an agent task of at most 100000 characters')
    const id = crypto.randomUUID()
    const base: Omit<AgentRun, 'sessionId' | 'workspaceId'> = {
      id, rootId: caller.rootId, parentId: caller.id, depth: caller.depth + 1,
      kind: preset ? 'dedicated' : 'on-demand', title: input.title.slice(0, 100), preset: preset ? structuredClone(preset) : undefined,
      model: preset?.model ?? caller.model, tools: intersectAgentTools(caller.tools, preset?.toolNames),
      allowOnDemand: caller.allowOnDemand && (preset?.allowOnDemand ?? true),
      dedicatedIds: caller.dedicatedIds.filter(id => policy.nestedDedicatedIds.includes(id) && (!preset || preset.dedicatedIds.includes(id))),
      status: 'queued', createdAt: Date.now(), updatedAt: Date.now(),
    }
    // No target model or workspace sees the task before guardian approval.
    await this.boundary(caller, { ...base, sessionId: '', workspaceId: '' }, { operation: 'task', from: caller.id, to: id, text: input.task }, signal)
    const created = await this.host.create(base, !!preset, caller.workspaceId)
    const run: AgentRun = { ...base, ...created }
    this.runs.set(id, run)
    await this.host.save(run)
    this.queue.push({ run, text: input.task }); this.notify(); void this.pump(caller.rootId)
    return run
    } finally { const remaining = (this.pendingSpawns.get(caller.rootId) || 1) - 1; if (remaining) this.pendingSpawns.set(caller.rootId, remaining); else this.pendingSpawns.delete(caller.rootId) }
  }
  private async set(run: AgentRun, patch: Partial<AgentRun>) { Object.assign(run, patch, { updatedAt: Date.now() }); await this.host.save(run); this.notify() }
  private async pump(rootId: string) {
    const policy = await this.host.policy(rootId).catch(() => undefined)
    if (!policy?.enabled || this.rootsStopping.has(rootId)) return
    while ([...this.active.keys()].filter(id => this.runs.get(id)?.rootId === rootId && this.runs.get(id)?.status !== 'waiting').length < policy.concurrency) {
      const index = this.queue.findIndex(entry => entry.run.rootId === rootId)
      if (index < 0) break
      const { run, text } = this.queue.splice(index, 1)[0]
      if (run.status !== 'queued') continue
      const controller = new AbortController(); this.active.set(run.id, controller)
      void this.perform(run, text, controller)
    }
  }
  private async perform(run: AgentRun, task: string, controller: AbortController) {
    try {
      await this.host.assertRoot(run.rootId); controller.signal.throwIfAborted()
      await this.set(run, { status: 'running', error: undefined })
      await this.host.execute(run, task, controller.signal)
      controller.signal.throwIfAborted()
      await this.set(run, { status: 'completed' })
    } catch (error) {
      await this.set(run, { status: controller.signal.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error) }).catch(() => {})
    } finally { this.active.delete(run.id); this.notify(); void this.pump(run.rootId) }
  }
  async message(caller: AgentCaller, id: string, text: string, signal?: AbortSignal) {
    const run = this.owned(caller, id)
    if (text.length > 100000 || !text.trim()) throw new Error('Provide a bounded follow-up message')
    if (this.active.has(id) || this.queue.some(entry => entry.run.id === id) || this.pendingMessages.has(id)) throw new Error('This agent is busy. Wait for its current task before sending a follow-up.')
    this.pendingMessages.add(id)
    try {
    await this.boundary(caller, run, { operation: 'message', from: caller.id, to: id, text }, signal)
    await this.set(run, { status: 'queued', error: undefined }); this.queue.push({ run, text }); void this.pump(run.rootId)
    return { id, status: 'queued' }
    } finally { this.pendingMessages.delete(id) }
  }
  async result(caller: AgentCaller, id: string, read: () => Promise<string>, signal?: AbortSignal) {
    const run = this.owned(caller, id); const text = await read()
    await this.boundary(caller, run, { operation: 'result', from: id, to: caller.id, text }, signal)
    return { id, status: run.status, text }
  }
  async transfer(caller: AgentCaller, id: string, direction: 'to-agent' | 'from-agent', sourcePath: string, targetPath: string, signal?: AbortSignal) {
    const run = this.owned(caller, id); await this.authorize(caller)
    sessionFilePath(sourcePath); sessionFilePath(targetPath)
    const source = direction === 'to-agent' ? caller.workspaceId : run.workspaceId, target = direction === 'to-agent' ? run.workspaceId : caller.workspaceId
    if (source === target) throw new Error('On-demand agents already share this workspace; no transfer is needed')
    const { bytes, mime } = await this.host.readFile(source, sourcePath)
    try {
      if (bytes.length > 10 * 1024 * 1024) throw new Error('Agent transfers are limited to 10 MB per file')
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      await this.boundary(caller, run, { operation: 'file', from: direction === 'to-agent' ? caller.id : id, to: direction === 'to-agent' ? id : caller.id, text: targetPath, file: { path: sourcePath, mime, bytes: bytes.length, sha256, data: bytes } }, signal)
      // Copy precisely the reviewed bytes; never re-read a path after approval.
      await this.host.writeFile(target, targetPath, bytes, mime)
      return { path: targetPath, sha256, bytes: bytes.length }
    } finally { bytes.fill(0) }
  }
  async cancel(caller: AgentCaller, id: string) { await this.authorize(caller); this.owned(caller, id); await this.cancelTree(id) }
  async check(caller: AgentCaller) { return this.authorize(caller) }
  async wait(caller: AgentCaller, ids: string[], signal?: AbortSignal) {
    await this.authorize(caller)
    const children = ids.map(id => this.owned(caller, id))
    const parent = this.runs.get(caller.id)
    if (parent && this.active.has(parent.id)) { await this.set(parent, { status: 'waiting' }); void this.pump(parent.rootId) }
    try {
      const until = Date.now() + 45000
      while (Date.now() < until && children.every(run => ['queued', 'running', 'waiting'].includes(run.status))) {
        signal?.throwIfAborted(); await this.authorize(caller)
        await new Promise<void>(resolve => { const timer = setTimeout(() => { unsubscribe(); signal?.removeEventListener('abort', wake); resolve() }, 1000); const wake = () => { clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', wake); resolve() }; const unsubscribe = this.subscribe(wake); signal?.addEventListener('abort', wake, { once: true }) })
      }
      return children.map(({ id, status }) => ({ id, status }))
    } finally {
      if (parent && parent.status === 'waiting') {
        while (!signal?.aborted && !this.rootsStopping.has(parent.rootId)) {
          const policy = await this.authorize(caller)
          if ([...this.active.keys()].filter(id => id !== parent.id && this.runs.get(id)?.rootId === parent.rootId && this.runs.get(id)?.status !== 'waiting').length < policy.concurrency) break
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        if (!signal?.aborted && parent.status === 'waiting') await this.set(parent, { status: 'running' })
      }
    }
  }
  async cancelTree(id: string) {
    for (const child of this.runs.values()) if (child.parentId === id) await this.cancelTree(child.id)
    this.active.get(id)?.abort(); this.queue = this.queue.filter(entry => entry.run.id !== id)
    const run = this.runs.get(id); if (run && ['queued', 'running', 'waiting'].includes(run.status)) await this.set(run, { status: 'cancelled' })
  }
  async stopRoot(rootId: string) { this.rootsStopping.add(rootId); for (const run of this.runs.values()) if (run.rootId === rootId && run.parentId === rootId) await this.cancelTree(run.id) }
  reopen(rootId: string) { this.rootsStopping.delete(rootId) }
  caller(run: AgentRun): AgentCaller { return { id: run.id, rootId: run.rootId, workspaceId: run.workspaceId, depth: run.depth, model: run.model, tools: run.tools, allowOnDemand: run.allowOnDemand, dedicatedIds: run.dedicatedIds } }
}
