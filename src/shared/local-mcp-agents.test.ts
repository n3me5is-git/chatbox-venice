import { asSchema } from 'ai'
import { expect, it, vi } from 'vitest'
import { createLocalMCPAgentTools } from './local-mcp-agents'
import { defaultLocalMCPPermissions, type LocalMCPGrant } from './local-mcp'
import { MultiAgentRuntime, type AgentCaller, type AgentHost } from './multi-agent-runtime'
import { DedicatedAgentSchema, MultiAgentPolicySchema } from './multi-agent'

function fixture() {
  let revoked = false
  const policy = MultiAgentPolicySchema.parse({ enabled: true, dedicatedIds: ['worker'], nestedDedicatedIds: ['worker'] })
  const preset = DedicatedAgentSchema.parse({ id: 'worker', name: 'worker', title: 'Worker', prompt: 'SECRET_SYSTEM_PROMPT', model: { provider: 'worker-provider', modelId: 'model' }, toolNames: ['session_file','web_search'], guardian: { enabled: true, prompt: 'SECRET_GUARD_PROMPT', model: { provider: 'private', modelId: 'guard' } } })
  const assert = vi.fn(async () => { if (revoked) throw Error('Local MCP access was revoked') })
  const files = new Map<string, Uint8Array>(), results = new Map<string, string>()
  const host: AgentHost = {
    policy: async () => policy, preset: async id => id === preset.id ? preset : undefined, assertRoot: assert,
    create: vi.fn(async (run, isolated, workspace) => ({ sessionId: 'chat-'+run.id, workspaceId: isolated ? 'sandbox-'+run.id : workspace })),
    save: async () => {}, execute: vi.fn(async run => { results.set(run.id, 'Reviewed summary'); return 'Reviewed summary' }),
    guard: vi.fn(async () => ({ allow: true, reason: 'Allowed' })), blocked: vi.fn(async () => {}), append: async () => {},
    readFile: async (workspace,path) => ({ bytes: new Uint8Array(files.get(workspace+':'+path) || []), mime: 'text/plain' }),
    writeFile: vi.fn(async (workspace,path,bytes) => { files.set(workspace+':'+path, bytes.slice()) }),
  }
  const runtime = new MultiAgentRuntime(host)
  const caller: AgentCaller = { id:'root',rootId:'root',workspaceId:'root',depth:0,model:{provider:'venice',modelId:'encrypted'},tools:['session_file'],allowOnDemand:true,dedicatedIds:['worker'] }
  const owned = new Set<string>()
  const access = { acquire: vi.fn(async () => { await assert(); return {caller,owned} }), assert, catalog: async () => [preset, {...preset,id:'hidden',name:'hidden'}], readResult: vi.fn(async (id:string) => results.get(id) || ''), listFiles: vi.fn(async()=>({files:[{path:'report.md',mime:'text/markdown',bytes:10}]})) }
  const grant: LocalMCPGrant = { running:true,sessionId:'root',url:'http://127.0.0.1:31337/mcp',token:'LOCAL_TOKEN',startedAt:1,permissions:{...defaultLocalMCPPermissions,writeFiles:true,multiAgent:true} }
  const tools = createLocalMCPAgentTools(grant,runtime,access)
  const call = async (name:string,input:unknown={}) => {
    const member=tools[name],validated=await asSchema(member.inputSchema).validate!(input)
    if (!validated.success) throw Error('Invalid tool arguments')
    return await member.execute!(validated.value,{toolCallId:'test',messages:[],context:{}}) as any
  }
  return {host,runtime,caller,owned,access,grant,tools,call,files,revoke:async()=>{revoked=true;await runtime.stopRoot('root')}}
}
it('is absent by default and lists schemas without acquiring a runtime grant or starting models', () => {
  const f=fixture()
  expect(createLocalMCPAgentTools({...f.grant,permissions:defaultLocalMCPPermissions},f.runtime,f.access)).toEqual({})
  expect(Object.keys(f.tools)).toEqual(expect.arrayContaining(['agent_catalog','agent_tree','agent_spawn','agent_status','agent_wait','agent_result','agent_message','agent_file','agent_stop']))
  expect(f.access.acquire).not.toHaveBeenCalled(); expect(f.host.execute).not.toHaveBeenCalled()
  expect(createLocalMCPAgentTools({...f.grant,permissions:{...f.grant.permissions,writeFiles:false}},f.runtime,f.access)).not.toHaveProperty('agent_file')
  expect(createLocalMCPAgentTools({...f.grant,permissions:{...f.grant.permissions,readFiles:false}},f.runtime,f.access)).not.toHaveProperty('agent_files')
})
it('returns only permitted catalog entries and inherited tools, without agent or guardian prompts',async()=>{
  const f=fixture(),catalog=await f.call('agent_catalog')
  expect(catalog).toEqual([expect.objectContaining({id:'worker',guardian:true,tools:['session_file']})])
  expect(JSON.stringify(catalog)).not.toContain('SECRET');expect(JSON.stringify(catalog)).not.toContain('LOCAL_TOKEN')
})
it('uses the actual runtime and guardian before starting a dedicated worker, returning a block to the caller',async()=>{
  const f=fixture();vi.mocked(f.host.guard).mockResolvedValue({allow:false,reason:'Personal data is forbidden'})
  const result=await f.call('agent_spawn',{title:'Review',task:'Explicit context',dedicatedId:'worker'})
  expect(result).toMatchObject({blocked:true,error:expect.stringContaining('Personal data is forbidden')});expect(f.host.create).not.toHaveBeenCalled();expect(f.host.execute).not.toHaveBeenCalled();expect(f.host.blocked).toHaveBeenCalled()
})
it('exposes the full nested tree as metadata while limiting controls to this grant’s direct workers',async()=>{
  const f=fixture(),first=await f.call('agent_spawn',{title:'Research',task:'Task'}),run=f.runtime.runs.get(first.id)!
  const child=await f.runtime.spawn(f.runtime.caller(run),{title:'Nested',task:'Nested task'})
  const old=await f.runtime.spawn(f.caller,{title:'Prior app run',task:'Task'})
  const foreign=await f.runtime.spawn({...f.caller,id:'other',rootId:'other',workspaceId:'other'},{title:'Other root',task:'Task'})
  const tree=await f.call('agent_tree')
  expect(tree.runs).toEqual(expect.arrayContaining([expect.objectContaining({id:first.id,controllable:true}),expect.objectContaining({id:child.id,parentId:first.id,depth:2,controllable:false})]))
  expect(tree.runs.some((item:any)=>item.id===foreign.id)).toBe(false);expect(JSON.stringify(tree)).not.toContain('SECRET')
  expect(await f.call('agent_status')).toEqual([expect.objectContaining({id:first.id})])
  for(const id of [child.id,old.id,foreign.id]) expect(await f.call('agent_result',{id})).toMatchObject({blocked:true,error:expect.stringContaining('this MCP sharing grant')})
  expect(f.access.readResult).not.toHaveBeenCalled()
})
it('reviews result egress and exact file bytes, with no write or summary returned after a guardian block',async()=>{
  const f=fixture(),worker=await f.call('agent_spawn',{title:'Review',task:'Task',dedicatedId:'worker'})
  await f.call('agent_wait',{ids:[worker.id]})
  expect(await f.call('agent_result',{id:worker.id})).toMatchObject({text:'Reviewed summary'})
  const listing=await f.call('agent_files',{id:worker.id});expect(JSON.parse(listing.text)).toEqual({files:[{path:'report.md',mime:'text/markdown',bytes:10}]})
  expect(f.access.listFiles).toHaveBeenCalledWith(worker.id,0,50)
  f.files.set('root:input.md',new TextEncoder().encode('Pseudonym 42'))
  const transfer=await f.call('agent_file',{id:worker.id,direction:'to-agent',sourcePath:'input.md',targetPath:'input.md'})
  expect(transfer.sha256).toHaveLength(64);expect(f.host.writeFile).toHaveBeenCalledTimes(1)
  const reviewed=vi.mocked(f.host.guard).mock.calls.at(-1)![1];expect(reviewed.file?.sha256).toBe(transfer.sha256);expect(reviewed.file?.data.every(byte=>byte===0)).toBe(true)
  vi.mocked(f.host.guard).mockResolvedValue({allow:false,reason:'Forbidden result'})
  const result=await f.call('agent_result',{id:worker.id});expect(result).toMatchObject({blocked:true});expect(JSON.stringify(result)).not.toContain('Reviewed summary')
  expect(await f.call('agent_files',{id:worker.id})).toMatchObject({blocked:true})
  expect(await f.call('agent_file',{id:worker.id,direction:'to-agent',sourcePath:'input.md',targetPath:'next.md'})).toMatchObject({blocked:true});expect(f.host.writeFile).toHaveBeenCalledTimes(1)
})
it('rejects forged caller/settings fields and revokes existing worker access on stop',async()=>{
  const f=fixture()
  await expect(f.call('agent_spawn',{title:'Task',task:'Task',callerId:'another',tools:['session_js']})).rejects.toThrow('Invalid')
  const worker=await f.call('agent_spawn',{title:'Task',task:'Task'})
  await f.revoke()
  expect(await f.call('agent_message',{id:worker.id,text:'Another task'})).toMatchObject({blocked:true,error:expect.stringContaining('revoked')})
})
