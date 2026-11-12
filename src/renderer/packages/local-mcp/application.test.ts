import {beforeEach,expect,it,vi} from 'vitest'
import {tool} from 'ai'
import {z} from 'zod'
import {defaultLocalMCPPermissions,LocalMCPApplicationSchema,type LocalMCPGrant} from '@shared/local-mcp'
const state=vi.hoisted(()=>({settings:new Map<string,unknown>(),headers:new Map<string,any>(),live:[] as any[],locked:new Set<string>(),count:0,call:vi.fn(),models:vi.fn(),dispose:vi.fn(),remove:vi.fn(),aliases:[] as string[],images:[] as any[]}))
vi.mock('@/platform',()=>({default:{type:'desktop',getImageGenerationStorage:()=>({initialize:async()=>{},getPage:async()=>({items:state.images,nextCursor:null})})}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>({defaultChatModel:{provider:'openai',model:'configured'}})})}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({db:{aliases:async()=>state.aliases,getSetting:async(key:string)=>state.settings.get(key),setSettingIfUnchanged:async(key:string,old:unknown,next:unknown)=>{if(state.settings.get(key)!==old)return false;state.settings.set(key,next);return true}},projects:{assertApp:async()=>{},assertSession:async(id:string)=>{if(state.locked.has(id))throw Error('Locked')}},assets:{remove:(key:string)=>state.remove(key)}})}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{repository:{meta:{getAllIncludingHidden:async()=>[...state.headers.values()]}},getSessionHeader:async(id:string)=>state.headers.has(id)?{header:state.headers.get(id)}:null,createSession:async(input:any)=>{const header={...input,id:'created-'+(++state.count)};state.headers.set(header.id,header);return header},updateSessionHeader:async(id:string,patch:any)=>state.headers.set(id,{...state.headers.get(id),...patch}),setSessionSystemPrompt:vi.fn(),deleteSession:vi.fn(async(id:string)=>state.headers.delete(id))}}}))
vi.mock('./backend',()=>({localMCPTools:async()=>[{name:'app_model',inputSchema:{type:'object',properties:{provider:{type:'string'}},required:['provider'],additionalProperties:false}},{name:'session_file',inputSchema:{type:'object'}}],handleSessionLocalMCP:(...args:any[])=>state.call(...args)}))
vi.mock('./conversation',()=>({applicationConversationTool:()=>tool({inputSchema:z.object({}),execute:async()=>({sent:true})})}))
vi.mock('./studio',()=>({applicationStudioTool:()=>tool({inputSchema:z.object({}),execute:async()=>({studio:true})})}))
vi.mock('./uploads',()=>({mcpUploadSchema:z.object({}),uploadMCPFile:vi.fn(),cleanupMCPUploads:vi.fn(async()=>{})}))
vi.mock('@/packages/session-resources/files',()=>({sessionFiles:{}}))
vi.mock('@/packages/venice/service',()=>({veniceMediaService:{list:async()=>[],removeVoice:vi.fn()}}))
vi.mock('@/stores/imageGenerationActions',()=>({getImageGenerationService:()=>({deleteRecord:vi.fn()})}))
vi.mock('@/packages/multi-agent/runtime',()=>({disposeTemporaryAgentRoot:(id:string)=>state.dispose(id),revokeExternalAgents:vi.fn(),multiAgentRuntime:{stopRoot:vi.fn(),runs:new Map()}}))
import {handleApplicationMCP} from './application'
const grant=(mode:'full'|'shadow'|'router',token='test-token'):LocalMCPGrant=>({running:true,sessionId:'application',endpointId:crypto.randomUUID(),application:LocalMCPApplicationSchema.parse({name:mode,mode,manageChats:true,providers:['venice']}),url:'http://127.0.0.1:3000/mcp',token,startedAt:1,permissions:{...defaultLocalMCPPermissions,writeFiles:true,models:true,venice:true}})
const call=(grant:LocalMCPGrant,name:string,args:Record<string,unknown>={})=>handleApplicationMCP({id:crypto.randomUUID(),operation:'call_tool',grant,name,arguments:args},new AbortController().signal)
beforeEach(()=>{state.settings.clear();state.headers.clear();state.live=[];state.locked.clear();state.count=0;state.aliases=[];state.images=[];vi.clearAllMocks();state.dispose.mockResolvedValue([]);state.remove.mockImplementation(async(key:string)=>{state.aliases=state.aliases.filter(alias=>alias!==key)});state.call.mockResolvedValue({text:'Result'});vi.stubGlobal('window',{dispatchEvent:vi.fn(),electronAPI:{invoke:vi.fn(async(_channel,command,id)=>command==='list'?state.live:state.live.find(item=>item.endpointId===id)||{running:false})}})})
it('confines shadows to their own contexts, rejects another endpoint and never lists locked names',async()=>{
  const a=grant('shadow','a'),b=grant('shadow','b');state.live=[a,b]
  state.headers.set('personal',{id:'personal',name:'Private business chat',settings:{}})
  const created=await call(a,'app_contexts',{action:'create',request_id:'create-one'}) as any
  expect(state.headers.get(created.sessionId)).toMatchObject({hidden:true,settings:{}})
  await expect(call(a,'app_contexts',{action:'get',sessionId:'personal'})).rejects.toThrow('only its own')
  await expect(call(b,'app_contexts',{action:'get',sessionId:created.sessionId})).rejects.toThrow('another MCP endpoint')
  const full=grant('full','full');state.live.push(full);state.locked.add('personal')
  expect(JSON.stringify(await call(full,'app_contexts',{action:'list'}))).not.toContain('Private business chat')
})
it('does not create duplicate contexts or execute paid tools twice after an identical retry',async()=>{
  const g=grant('shadow');state.live=[g]
  const first=await call(g,'app_contexts',{action:'create',request_id:'one'}) as any
  expect(await call(g,'app_contexts',{action:'create',request_id:'one'})).toEqual(first);expect(state.count).toBe(1)
  const input={sessionId:first.sessionId,name:'app_model',arguments:{provider:'venice'},request_id:'paid-one'}
  await call(g,'app_call',input);await call(g,'app_call',input);expect(state.call).toHaveBeenCalledTimes(1)
  await expect(call(g,'app_call',{...input,arguments:{provider:'openai'}})).rejects.toThrow('new request_id')
  await expect(call(g,'app_call',{...input,request_id:'other',name:'session_js'})).rejects.toThrow('permissions')
})
it('router exposes only model/Studio/transfer tools, rejects a chat API and keeps inputs isolated',async()=>{
  const g=grant('router');state.live=[g]
  const tools=await handleApplicationMCP({id:'list',operation:'list_tools',grant:g},new AbortController().signal) as any[]
  expect(tools.map(tool=>tool.name)).toContain('app_model');expect(tools.map(tool=>tool.name)).toContain('venice_studio')
  for(const name of ['app_contexts','app_conversation','app_call','session_file','agent_spawn','web_search'])expect(tools.map(tool=>tool.name)).not.toContain(name)
  await expect(call(g,'app_contexts',{action:'list'})).rejects.toThrow('permissions')
  await expect(call(g,'app_model',{provider:'venice'})).rejects.toThrow('arguments')
  await call(g,'app_model',{provider:'venice',request_id:'paid'})
  expect(state.call).toHaveBeenCalledWith(expect.objectContaining({arguments:{provider:'venice'},grant:expect.objectContaining({sessionId:'created-1'})}),expect.any(AbortSignal))
})
it('revocation is checked before returning app data and unknown parameters cannot smuggle credentials',async()=>{
  const g=grant('shadow');state.live=[g]
  await expect(call(g,'app_contexts',{action:'create',request_id:'a',settings:{apiKey:'no'}})).rejects.toThrow('arguments')
  state.live=[];await expect(call(g,'app_contexts',{action:'list'})).rejects.toThrow('revoked');expect(state.count).toBe(0)
})

it('refuses cleanup while a paid operation is running, then removes only its own temporary context',async()=>{
  const g=grant('shadow','cleanup-race');state.live=[g]
  state.headers.set('personal',{id:'personal',name:'Keep me',settings:{}})
  const {sessionId}=await call(g,'app_contexts',{action:'create',request_id:'temporary'}) as any
  let finish!:(result:unknown)=>void;state.call.mockImplementation(()=>new Promise(resolve=>finish=resolve))
  const running=call(g,'app_call',{sessionId,name:'app_model',arguments:{provider:'venice'},request_id:'pending'})
  await vi.waitFor(()=>expect(state.call).toHaveBeenCalled())
  await expect(call(g,'app_cleanup',{sessionId})).rejects.toThrow('active workspace operations');expect(state.headers.has(sessionId)).toBe(true)
  finish({text:'Completed'});await running
  expect(await call(g,'app_cleanup',{sessionId})).toEqual({deleted:1});expect(state.headers.has(sessionId)).toBe(false);expect(state.headers.has('personal')).toBe(true)
})

it('does not create a router workspace merely to clean an already empty endpoint',async()=>{
 const g=grant('router','cleanup-empty');state.live=[g]
 expect(await call(g,'app_cleanup',{})).toEqual({deleted:0});expect(state.count).toBe(0)
})

it('refreshes status observations even when a client reuses its request ID',async()=>{
 const g=grant('shadow','polling');state.live=[g]
 const {sessionId}=await call(g,'app_contexts',{action:'create',request_id:'workspace'}) as any
 const input={sessionId,name:'venice_media',arguments:{action:'status',id:'video-one'},request_id:'poll'}
 state.call.mockResolvedValueOnce({status:'queued'}).mockResolvedValueOnce({status:'ready'})
 expect(await call(g,'app_call',input)).toMatchObject({status:'queued'});expect(await call(g,'app_call',input)).toMatchObject({status:'ready'});expect(state.call).toHaveBeenCalledTimes(2)
})

it('deletes owned image outputs and fresh input copies while retaining unrelated protected images and borrowed inputs',async()=>{
 const g=grant('shadow','image-cleanup');state.live=[g]
 const {sessionId}=await call(g,'app_contexts',{action:'create',request_id:'image-workspace'}) as any
 const id=crypto.randomUUID(),other=crypto.randomUUID(),owned='picture:image-gen:'+id+':output',unrelated='picture:image-gen:'+other+':output'
 state.images=[{id,source:{sessionId},generatedImages:[owned]}]
 state.aliases=[owned,unrelated,'new-reference','borrowed-reference']
 const {registerTemporaryMCPImage}=await import('./temporary')
 await registerTemporaryMCPImage({id,source:{sessionId},referenceImages:['new-reference','borrowed-reference']},['data:image/png;base64,AQID','borrowed-reference'])
 expect(await call(g,'app_cleanup',{sessionId})).toMatchObject({deleted:1})
 expect(state.remove).toHaveBeenCalledWith(owned);expect(state.remove).toHaveBeenCalledWith('new-reference')
 expect(state.aliases).toEqual([unrelated,'borrowed-reference'])
})
it('keeps a partially stopped context pending, blocks new paid work and allows cleanup to retry',async()=>{
 const g=grant('shadow','pending-cleanup');state.live=[g]
 const {sessionId}=await call(g,'app_contexts',{action:'create',request_id:'pending-workspace'}) as any
 state.dispose.mockRejectedValueOnce(Error('Still stopping'))
 await expect(call(g,'app_cleanup',{sessionId})).rejects.toThrow('Still stopping')
 await expect(call(g,'app_call',{sessionId,name:'app_model',arguments:{provider:'venice'},request_id:'must-not-pay'})).rejects.toThrow('awaiting cleanup')
 expect(state.call).not.toHaveBeenCalled();expect(await call(g,'app_cleanup',{sessionId})).toMatchObject({deleted:1})
})
