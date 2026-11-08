// @vitest-environment jsdom
import { asSchema, tool } from 'ai'
import { z } from 'zod'
import { beforeEach, expect, it, vi } from 'vitest'
import { defaultLocalMCPPermissions, type LocalMCPGrant } from '@shared/local-mcp'
const state=vi.hoisted(()=>({headers:new Map<string,any>(),messages:new Map<string,any[]>(),data:new Map<string,any>(),resources:new Map<string,any[]>(),chat:vi.fn(),write:vi.fn(),request:vi.fn()}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessionEvents:{subscribe:vi.fn()},sessions:{
  getSessionHeader:async(id:string)=>state.headers.has(id)?{header:state.headers.get(id)}:null,
  createSession:async(input:any)=>{const id=crypto.randomUUID();state.headers.set(id,{...input,id});return{id}},
  updateSessionHeader:async(id:string,change:any)=>{state.headers.set(id,change(state.headers.get(id)))},
  readSessionTranscriptWindow:async({sessionId}:any)=>({messages:(state.messages.get(sessionId)||[]).map(message=>({message})),newer:undefined}),
  insertMessage:async(id:string,message:any)=>state.messages.set(id,[...(state.messages.get(id)||[]),message]),
  insertMessages:async(id:string,messages:any[])=>state.messages.set(id,[...(state.messages.get(id)||[]),...messages]),
  updateMessage:async(id:string,messageId:string,change:any)=>state.messages.set(id,(state.messages.get(id)||[]).map(message=>message.id===messageId?change(message):message)),
}}}))
vi.mock('@/adapters',()=>({createModel:async()=>({isSupportVision:()=>false,isSupportToolUse:()=>true,chat:state.chat})}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{assertSession:async()=>{}}})}))
vi.mock('@/stores/session/session-settings',()=>({getSessionSettings:async(id:string)=>state.headers.get(id)?.settings||{}}))
vi.mock('@/packages/model-calls/toolsets/view-image',()=>({buildViewImageToolSet:()=>undefined}))
vi.mock('@/packages/model-calls/message-utils',()=>({convertToModelMessages:async(messages:any)=>messages}))
vi.mock('@/packages/model-calls/toolsets/web-search',()=>({buildWebSearchTools:()=>({}),parseLinkTool:{}}))
vi.mock('@/packages/mcp/controller',()=>({mcpController:{getAvailableTools:()=>({})}}))
vi.mock('@/packages/session-resources/tools',()=>({sessionWorkspaceInstructions:'Workspace',buildSessionWorkspaceTools:async()=>({session_file:tool({inputSchema:z.object({action:z.string(),path:z.string().optional(),content:z.string().optional()}),execute:state.write})})}))
vi.mock('@/packages/session-resources/files',()=>({sessionFiles:{list:async()=>[]}}))
vi.mock('@/packages/session-resources/service',()=>({listSessionResources:async(id:string)=>({items:state.resources.get(id)||[],truncated:false}),readSessionResource:vi.fn()}))
vi.mock('@/packages/collaboration/bridge',()=>({assertSharedTurn:vi.fn(),routeSharedDecision:vi.fn()}))
vi.mock('@/components/agent/UserQuestion',()=>({requestUserAnswers:state.request}))
vi.mock('./library',()=>({listDedicatedAgents:async()=>[]}))
vi.mock('./storage',()=>({readAgentData:async(key:string,fallback:any)=>state.data.get(key)||fallback,updateAgentData:async(key:string,fallback:any,update:any)=>{const next=update(state.data.get(key)||fallback);state.data.set(key,next);return next}}))
import { buildExternalMultiAgentTools, multiAgentRuntime, revokeExternalAgents } from './runtime'
let grant:LocalMCPGrant,live:boolean
beforeEach(()=>{
  vi.clearAllMocks();state.headers.clear();state.messages.clear();state.data.clear();state.resources.clear();multiAgentRuntime.runs.clear();live=true
  grant={running:true,sessionId:crypto.randomUUID(),url:'http://127.0.0.1:31337/mcp',token:crypto.randomUUID(),startedAt:1,permissions:{...defaultLocalMCPPermissions,multiAgent:true}}
  state.headers.set(grant.sessionId,{id:grant.sessionId,settings:{provider:'venice',modelId:'test',agentMode:{value:'on'},multiAgent:{enabled:true}}})
})
const build=()=>buildExternalMultiAgentTools(grant,{session_file:{} as any},async()=>{if(!live)throw Error('Revoked')})
async function call(tools:any,name:string,input:any={}){const member=tools[name],validated=await asSchema(member.inputSchema).validate!(input);if(!validated.success)throw Error('Invalid');return await member.execute(validated.value,{toolCallId:'test',messages:[],context:{}})}
it('runs the real renderer worker adapter while preserving a read-only file grant',async()=>{
  state.chat.mockImplementation(async(_messages,options)=>{
    await expect(options.tools.session_file.execute({action:'write',path:'secret.txt',content:'data'},{abortSignal:options.signal,context:{}})).rejects.toThrow('MCP sharing permissions')
    expect(options.tools.session_js).toBeUndefined()
    expect(options.tools.venice_image).toBeUndefined()
    expect(options.tools.agent_file).toBeDefined()
    const denied=await options.tools.agent_file.execute({id:'unknown',direction:'to-agent',sourcePath:'a',targetPath:'b'},{context:{}}).catch((error:Error)=>({error:error.message}))
    expect(denied.error).toContain('MCP sharing permissions')
    return {contentParts:[{type:'text',text:'Completed without writing'}]}
  })
  const tools=build(),worker=await call(tools,'agent_spawn',{title:'Readonly task',task:'Use only approved tools'})
  expect(worker.blocked).toBeUndefined();await call(tools,'agent_wait',{ids:[worker.id]})
  expect(await call(tools,'agent_result',{id:worker.id})).toMatchObject({text:'Completed without writing'})
  expect(state.chat).toHaveBeenCalledOnce();expect(state.write).not.toHaveBeenCalled()
  state.resources.set(grant.sessionId,[{path:'input.md',mime:'text/markdown',bytes:10}])
  state.resources.set(multiAgentRuntime.runs.get(worker.id)!.sessionId,[{path:'media/music/saved.wav',mime:'audio/wav',bytes:100}])
  const first=JSON.parse((await call(tools,'agent_files',{id:worker.id,limit:1})).text)
  expect(first).toMatchObject({files:[{path:'input.md'}],resources:[],nextOffset:1})
  const second=JSON.parse((await call(tools,'agent_files',{id:worker.id,offset:first.nextOffset,limit:1})).text)
  expect(second).toMatchObject({files:[],resources:[{path:'media/music/saved.wav'}],nextOffset:null})
  await revokeExternalAgents(grant.token)
})
it('requires Work and explicit multi-agent policy, then cancels a running renderer worker on revocation',async()=>{
  state.headers.get(grant.sessionId).settings.multiAgent.enabled=false
  expect(await call(build(),'agent_spawn',{title:'No permission',task:'Task'})).toMatchObject({blocked:true})
  expect(state.chat).not.toHaveBeenCalled()
  state.headers.get(grant.sessionId).settings.multiAgent.enabled=true
  let signal:AbortSignal|undefined
  state.chat.mockImplementation(async(_messages,options)=>{signal=options.signal;await new Promise<void>(resolve=>signal!.addEventListener('abort',()=>resolve(),{once:true}));return{contentParts:[]}})
  const tools=build(),worker=await call(tools,'agent_spawn',{title:'Task',task:'Task'})
  await vi.waitFor(()=>expect(signal).toBeDefined())
  live=false;await revokeExternalAgents(grant.token)
  expect(signal!.aborted).toBe(true)
  expect(await call(tools,'agent_message',{id:worker.id,text:'Resume'})).toMatchObject({blocked:true,error:expect.stringContaining('Revoked')})
})
