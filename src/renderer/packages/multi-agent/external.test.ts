// @vitest-environment jsdom
import { asSchema, tool } from 'ai'
import { z } from 'zod'
import { beforeEach, expect, it, vi } from 'vitest'
import { defaultLocalMCPPermissions, type LocalMCPGrant } from '@shared/local-mcp'
const state=vi.hoisted(()=>({headers:new Map<string,any>(),messages:new Map<string,any[]>(),data:new Map<string,any>(),resources:new Map<string,any[]>(),chat:vi.fn(),write:vi.fn(),request:vi.fn(),image:vi.fn(),imageInit:vi.fn(),platform:'desktop',agents:[] as any[],providers:{} as Record<string,any>}))
vi.mock('@/platform',()=>({default:{get type(){return state.platform}}}))
vi.mock('./worker-context',()=>({createWorkerContext:async()=>({prepare:async(messages:unknown)=>messages})}))
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
vi.mock('@/packages/collaboration/bridge',()=>({assertSharedTurn:vi.fn(),routeSharedDecision:async(_id:unknown,_requester:unknown,_input:unknown,local:any)=>local(new AbortController().signal)}))
vi.mock('@/components/agent/UserQuestion',()=>({requestUserAnswers:state.request}))
vi.mock('./library',()=>({listDedicatedAgents:async()=>state.agents}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({providers:state.providers})}}))
vi.mock('@/packages/chatgpt-subscription/image-tools',()=>({subscriptionChatImageTools:(...args:any[])=>{state.imageInit(...args);return {chatgpt_image:{execute:state.image}}}}))
vi.mock('./storage',()=>({readAgentData:async(key:string,fallback:any)=>state.data.get(key)||fallback,updateAgentData:async(key:string,fallback:any,update:any)=>{const next=update(state.data.get(key)||fallback);state.data.set(key,next);return next}}))
import { buildExternalMultiAgentTools, buildMultiAgentTools, multiAgentRuntime, revokeExternalAgents } from './runtime'
let grant:LocalMCPGrant,live:boolean
beforeEach(()=>{
  vi.clearAllMocks();state.headers.clear();state.messages.clear();state.data.clear();state.resources.clear();multiAgentRuntime.runs.clear();live=true;state.platform='desktop';state.agents=[];state.providers={};state.image.mockResolvedValue({recordId:'saved-image'})
  grant={running:true,sessionId:crypto.randomUUID(),url:'http://127.0.0.1:31337/mcp',token:crypto.randomUUID(),startedAt:1,permissions:{...defaultLocalMCPPermissions,multiAgent:true}}
  state.headers.set(grant.sessionId,{id:grant.sessionId,settings:{provider:'venice',modelId:'test',agentMode:{value:'on'},multiAgent:{enabled:true}}})
})
const build=()=>buildExternalMultiAgentTools(grant,{session_file:{} as any},async()=>{if(!live)throw Error('Revoked')})
async function call(tools:any,name:string,input:any={}){const member=tools[name],validated=await asSchema(member.inputSchema).validate!(input);if(!validated.success)throw Error('Invalid');return await member.execute(validated.value,{toolCallId:'test',messages:[],context:{}})}
it('runs the real renderer worker adapter while preserving a read-only file grant',async()=>{
  Object.assign(state.headers.get(grant.sessionId).settings,{contextTokenLimit:50000,autoCompaction:false})
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
  expect(state.headers.get(multiAgentRuntime.runs.get(worker.id)!.sessionId).settings).toMatchObject({contextTokenLimit:50000,autoCompaction:false})
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

it.each(['desktop','mobile'])('executes an app worker with native image and HITL tools on %s',async platform=>{
  state.platform=platform
  const settings={provider:'openai-sub-unofficial',modelId:'test',agentMode:{value:'on'},multiAgent:{enabled:true}}
  state.headers.get(grant.sessionId).settings=settings
  state.chat.mockImplementation(async(_messages,options)=>{
    expect(options.tools.chatgpt_image).toBeDefined()
    expect(await options.tools.chatgpt_image.execute({action:'models'},{context:{}})).toMatchObject({recordId:'saved-image'})
    state.request.mockResolvedValue({answers:[{selected:[],text:'Use the original'}]})
    await options.tools.ask_user.execute({questions:[{question:'Which version?'}]},{context:{}})
    state.providers['openai-sub-unofficial']={subscriptionChatImages:false}
    await expect(options.tools.chatgpt_image.execute({action:'generate'},{context:{}})).rejects.toThrow('disabled')
    return {contentParts:[{type:'text',text:'Worker tools verified'}]}
  })
  const prepared=await buildMultiAgentTools(grant.sessionId,settings as any,{session_file:{} as any,chatgpt_image:{} as any,ask_user:{} as any},[])
  const worker=await call(prepared.tools,'agent_spawn',{title:'Image task',task:'Inspect the available image tool and ask a question'})
  await call(prepared.tools,'agent_wait',{ids:[worker.id]})
  expect(await call(prepared.tools,'agent_result',{id:worker.id})).toMatchObject({text:'Worker tools verified'})
  expect(state.image).toHaveBeenCalledOnce();expect(state.chat).toHaveBeenCalledOnce();expect(state.request).toHaveBeenCalledOnce()
  state.providers={}
  await call(prepared.tools,'agent_message',{id:worker.id,text:'An explicit follow-up task'})
  await call(prepared.tools,'agent_wait',{ids:[worker.id]})
  expect(state.imageInit).toHaveBeenCalledTimes(2)
  expect(state.imageInit.mock.calls[0][0]).toBe(state.imageInit.mock.calls[1][0])
  expect(state.imageInit.mock.calls[0][2]).not.toBe(state.imageInit.mock.calls[1][2])
  expect(state.image).toHaveBeenCalledTimes(2)
})
it('provides caller details to root and permitted nested workers while keeping unshared prompts private',async()=>{
  state.platform='mobile'
  state.agents=[{id:'writer',name:'writer',title:'Writer',description:'Write reports\nUse a clear structure',additionalDetails:'Send a topic and desired length',prompt:'SHARED_WORKER_PROMPT',sharePromptWithCaller:true,model:{provider:'venice',modelId:'test'},toolNames:[],allowOnDemand:false,dedicatedIds:[],guardian:{enabled:true,prompt:'GUARDIAN_SECRET'}},{id:'hidden',name:'hidden',title:'Hidden',description:'Hidden',prompt:'HIDDEN_PROMPT'}]
  const settings={provider:'venice',modelId:'test',agentMode:{value:'on'},multiAgent:{enabled:true,dedicatedIds:['writer'],nestedDedicatedIds:['writer']}}
  state.headers.get(grant.sessionId).settings=settings
  const prepared=await buildMultiAgentTools(grant.sessionId,settings as any,{},[])
  expect(prepared.instructions).toContain('SHARED_WORKER_PROMPT');expect(prepared.instructions).not.toContain('GUARDIAN_SECRET');expect(prepared.instructions).not.toContain('HIDDEN_PROMPT')
  state.chat.mockImplementation(async(_messages,options)=>{
    const catalog=await call(options.tools,'agent_catalog')
    expect(catalog).toHaveLength(1);expect(catalog[0].description).toContain('Send a topic');expect(catalog[0].description).toContain('SHARED_WORKER_PROMPT')
    state.agents[0].sharePromptWithCaller=false
    expect(JSON.stringify(await call(options.tools,'agent_catalog'))).not.toContain('SHARED_WORKER_PROMPT')
    return {contentParts:[{type:'text',text:'Caller details verified'}]}
  })
  const worker=await call(prepared.tools,'agent_spawn',{title:'Inspect agents',task:'Read the allowed agent catalog'})
  await call(prepared.tools,'agent_wait',{ids:[worker.id]})
  expect(await call(prepared.tools,'agent_result',{id:worker.id})).toMatchObject({text:'Caller details verified'})
})
