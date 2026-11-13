import {applicationStudioTool} from './studio'
import {uploadMCPFile,mcpUploadSchema,cleanupMCPUploads} from './uploads'
import {validatedToolSchema} from '@shared/validated-tool-schema'
import {applicationConversationTool} from './conversation'
import {asSchema,tool,type ToolSet} from 'ai'
import {z} from 'zod'
import {LocalMCPApplicationSchema,localMCPObservation,localMCPAllows,localMCPGrantAllows,type LocalMCPGrant,type LocalMCPRequest} from '@shared/local-mcp'
import {SessionSettingsSchema,type SessionSettings} from '@shared/types'
import {MultiAgentPolicySchema} from '@shared/multi-agent'
import {rendererApplication} from '@/app/renderer-application'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import {sessionFiles} from '@/packages/session-resources/files'
import {settingsStore} from '@/stores/settingsStore'
import platform from '@/platform'
import {handleSessionLocalMCP,localMCPTools} from './backend'

import {temporaryMCPEntries as entries,mutateTemporaryMCPEntries as mutate,localMCPOwner as owner} from './temporary'
const active=new Map<string,Set<{id?:string;work:Promise<unknown>}>>()
const closing=new Set<string>()
const disposing=new Map<string,Promise<void>>()
const creating=new Map<string,Promise<string>>()
const calls=new Map<string,Map<string,{fingerprint:string;work:Promise<unknown>;contextId?:string;settled?:boolean}>>()
const vault=()=>vaultRuntimeFor(platform)
const idSchema=z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const optionsSchema=z.object({provider:z.string().min(1).max(128).optional(),modelId:z.string().min(1).max(256).optional(),temperature:z.number().min(0).max(2).optional(),topP:z.number().min(0).max(1).optional(),maxTokens:z.number().int().min(1).max(128000).optional(),contextTokenLimit:z.number().int().min(1024).max(10000000).optional(),webBrowsing:z.boolean().optional(),veniceToolsEnabled:z.boolean().optional(),providerOptionsByModel:z.record(z.string(),z.unknown()).optional(),multiAgent:MultiAgentPolicySchema.optional()}).strict()
async function live(grant:LocalMCPGrant,signal?:AbortSignal){
  signal?.throwIfAborted();await vault().projects.assertApp()
  const current=await window.electronAPI.invoke('local-mcp:control','status',grant.endpointId)
  if(!current.running||current.token!==grant.token||JSON.stringify(current.application)!==JSON.stringify(grant.application)||JSON.stringify(current.permissions)!==JSON.stringify(grant.permissions))throw Error('Local MCP access was revoked')
}
async function authorized(grant:LocalMCPGrant,id:string,signal?:AbortSignal,readDuringCleanup=false){
  await live(grant,signal);if(closing.has(id))throw Error('This workspace is being cleaned up');await vault().projects.assertSession(id)
  const all=await entries(),own=await owner(grant),entry=all.find(item=>item.id===id)
  if(entry?.cleanupPending&&!readDuringCleanup)throw Error('This temporary workspace is awaiting cleanup. Retrieve saved files or retry app_cleanup.')
  // Even full access cannot open another endpoint's temporary workspace.
  if(entry&&entry.owner!==own)throw Error('This temporary workspace belongs to another MCP endpoint')
  if(grant.application!.mode!=='full'&&!entry)throw Error('This endpoint can access only its own temporary workspaces')
  const read=await rendererApplication.sessions.getSessionHeader(id)
  if(!read)throw Error('Chat is unavailable')
  if(read.header.settings?.multiAgentRun)throw Error('Use the reviewed agent tools to access child sandboxes')
  return read.header
}
function constrained(grant:LocalMCPGrant,settings:SessionSettings):SessionSettings{
  const app=grant.application!
  if(settings.provider&&app.providers&&!app.providers.includes(settings.provider))throw Error('This provider is not granted to this endpoint')
  if(app.privacy!=='auto'&&settings.provider&&settings.provider!=='venice')throw Error('This endpoint requires a protected Venice model')
  const policy=settings.multiAgent
  if(policy&&(!grant.permissions.multiAgent||policy.dedicatedIds.some(id=>!app.dedicatedIds.includes(id))||policy.nestedDedicatedIds.some(id=>!app.dedicatedIds.includes(id))))throw Error('This agent policy exceeds the endpoint permissions')
  return {...settings,...(app.privacy!=='auto'?{veniceSecurity:{...settings.veniceSecurity,textPrivacy:app.privacy}}:{})}
}
async function createContext(grant:LocalMCPGrant,input:{name?:string;settings?:z.infer<typeof optionsSchema>;temporary?:boolean},signal:AbortSignal){
  await live(grant,signal)
  const awaitOwner=await owner(grant),app=grant.application!,temporary=app.mode!=='full'||input.temporary!==false
  if(!temporary&&!app.manageChats)throw Error('Persistent chat creation is not granted')
  if((await entries()).filter(item=>item.owner===awaitOwner).length>=32)throw Error('Clean up a temporary workspace before creating another')
  const preferred=settingsStore.getState().getSettings().defaultChatModel
  const defaults=preferred&&(!app.providers||app.providers.includes(preferred.provider))&&(app.privacy==='auto'||preferred.provider==='venice')?preferred:undefined
  const supplied=input.settings||{},settings=constrained(grant,SessionSettingsSchema.parse({...(defaults?{provider:defaults.provider,modelId:defaults.model}:app.privacy!=='auto'?{provider:'venice'}:{}),...supplied,agentMode:{value:'on',locked:false,lockReason:null}}))
  const header=await rendererApplication.sessions.createSession({type:'chat',name:temporary?'MCP temporary workspace':input.name||'MCP chat',hidden:temporary,threadName:'',messages:[],settings})
  if(temporary){try{await mutate(items=>[...items,{id:header.id,owner:awaitOwner,endpointId:grant.endpointId!,createdAt:Date.now()}])}catch(error){await rendererApplication.sessions.deleteSession(header.id);throw error}}
  signal.throwIfAborted();await live(grant,signal);return header.id
}
async function defaultContext(grant:LocalMCPGrant,signal:AbortSignal){
  const awaitOwner=await owner(grant),existing=(await entries()).find(item=>item.owner===awaitOwner&&!item.rootId)
  if(existing)return existing.id
  let work=creating.get(grant.token)
  if(!work){work=createContext(grant,{},signal);creating.set(grant.token,work);void work.finally(()=>creating.delete(grant.token)).catch(()=>{})}
  return work
}
function bound(grant:LocalMCPGrant,id:string):LocalMCPGrant{return {...grant,sessionId:id}}
async function unique(grant:LocalMCPGrant,key:string,input:unknown,work:()=>Promise<unknown>){
  const cache=calls.get(grant.token)||new Map();calls.set(grant.token,cache)
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value)))),n=>n.toString(16).padStart(2,'0')).join(''),existing=cache.get(key)
  if(existing){if(existing.fingerprint!==fingerprint)throw Error('Use a new request_id for a different operation');return existing.work}
  if(cache.size>=512)throw Error('Restart this endpoint before issuing more operations')
  const pending=work(),entry:{fingerprint:string;work:Promise<unknown>;contextId?:string;settled?:boolean}={fingerprint,work:pending,contextId:input&&typeof input==='object'&&'sessionId'in input&&typeof input.sessionId==='string'?input.sessionId:undefined};cache.set(key,entry)
  void pending.then(result=>{entry.settled=true;if(result&&typeof result==='object'&&'sessionId'in result&&typeof result.sessionId==='string')entry.contextId=result.sessionId;if(JSON.stringify(result??null).length>64000)entry.work=Promise.resolve({completed:true,resultRetained:false,message:'The original operation completed. Retrieve saved files or inspect its context; this request_id will not run it again.'})},()=>{entry.settled=true;entry.work=Promise.resolve({failed:true,message:'The original operation failed or stopped. Inspect its saved context and explain the failure before creating a new request_id.'})})
  return pending
}
async function disposeContextWork(id:string){
  if([...active.values()].some(items=>[...items].some(item=>item.id===id)))throw Error('Wait for active workspace operations before cleanup')
  closing.add(id)
  try{
  await vault().projects.assertSession(id)
  const temporary=(await entries()).find(item=>item.id===id)
  if(temporary)await cleanupMCPUploads(temporary.owner,id)
  const {veniceMediaService}=await import('@/packages/venice/service')
  const {getImageGenerationService}=await import('@/stores/imageGenerationActions')
  const ids=new Set([id,...(await entries()).filter(item=>item.rootId===id).map(item=>item.id)])
  await mutate(items=>items.map(item=>item.id===id?{...item,cleanupPending:true}:item))
  const {disposeTemporaryAgentRoot}=await import('@/packages/multi-agent/runtime')
  for(const child of await disposeTemporaryAgentRoot(id))ids.add(child)
  const {sessionApprovals}=await import('@/packages/venice/session-approvals');for(const child of ids)sessionApprovals.clear(child)
  for(const voice of temporary?.voices||[])await veniceMediaService.removeVoice(voice)
  for(const record of await veniceMediaService.list())if(record.sessionId&&ids.has(record.sessionId))await veniceMediaService.remove(record.id,!!record.queueId&&!record.remoteCleaned)
  const images=platform.getImageGenerationStorage();await images.initialize();let cursor:number|null=0;const records:string[]=[]
  do{const page=await images.getPage(cursor,100);for(const record of page.items)if(record.source?.sessionId&&ids.has(record.source.sessionId))records.push(record.id);cursor=page.nextCursor}while(cursor!==null)
  const temporaryEntries=(await entries()).filter(item=>ids.has(item.id)),imageIds=new Set([...records,...temporaryEntries.flatMap(item=>item.imageIds||[])])
  for(const record of records)await getImageGenerationService().deleteRecord(record)
  // The ordinary gallery conservatively retains unknown references while other
  // protected records are locked. These aliases belong to this temporary run,
  // including outputs written just before cancellation, so they can be removed.
  for(const alias of await vault().db.aliases()){
    const match=/^picture(?::)?image-gen(?::)?([a-f0-9-]{36})/.exec(alias)
    if(match&&imageIds.has(match[1]))await vault().assets.remove(alias)
  }
  for(const key of temporaryEntries.flatMap(item=>item.ownedAssets||[]))await vault().assets.remove(key)
  for(const child of [...ids].reverse())if(await rendererApplication.sessions.getSessionHeader(child))await rendererApplication.sessions.deleteSession(child)
  for(const cache of calls.values())for(const entry of cache.values())if(entry.settled&&entry.contextId&&ids.has(entry.contextId))entry.work=Promise.resolve({completed:true,resultRetained:false,message:'This temporary workspace was deleted. The original operation will not be replayed.'})
  await mutate(items=>items.filter(item=>!ids.has(item.id)))
  }finally{closing.delete(id)}
}
function disposeContext(id:string){let work=disposing.get(id);if(!work){work=disposeContextWork(id);disposing.set(id,work);void work.finally(()=>disposing.delete(id)).catch(()=>{})}return work}
const revoking=new Map<string,Promise<{pending:number}|undefined>>()
async function revokeApplicationWork(grant:LocalMCPGrant){
  if(!grant.application)return
  calls.delete(grant.token)
  const awaitOwner=await owner(grant),running=[...[...(active.get(grant.token)||[])].map(item=>item.work),...(creating.has(grant.token)?[creating.get(grant.token)!]:[])]
  if(running.length){let timer:ReturnType<typeof setTimeout>|undefined;const done=await Promise.race([Promise.allSettled(running).then(()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),10000)})]);if(timer)clearTimeout(timer);if(!done)return {pending:(await entries()).filter(item=>item.owner===awaitOwner).length}}
  await (await import('@/packages/multi-agent/runtime')).revokeExternalAgents(grant.token)
  const own=await owner(grant),failed:string[]=[]
  await cleanupMCPUploads(own).catch(()=>failed.push('uploads'))
  for(const entry of await entries())if(entry.owner===own&&!entry.rootId)try{await disposeContext(entry.id)}catch{failed.push(entry.id)}
  return {pending:failed.length}
}
export async function revokeApplicationMCP(grant:LocalMCPGrant){
  let work=revoking.get(grant.token);if(!work){work=revokeApplicationWork(grant);revoking.set(grant.token,work);void work.finally(()=>revoking.delete(grant.token)).catch(()=>{})}return work
}
export async function cleanupInactiveMCPContexts(){
  await vault().projects.assertApp()
  const active=await window.electronAPI.invoke('local-mcp:control','list') as LocalMCPGrant[]
  const owners=new Set(await Promise.all(active.map(owner))),failed:string[]=[]
  for(const entry of await entries())if(!owners.has(entry.owner)&&!entry.rootId)try{await disposeContext(entry.id)}catch{failed.push(entry.id)}
  return {pending:failed.length}
}
function appTools(grant:LocalMCPGrant,signal:AbortSignal):ToolSet{
  const app=LocalMCPApplicationSchema.parse(grant.application)
  return {
    venice_studio:applicationStudioTool(grant,signal,async requested=>{const id=grant.application!.mode==='router'?await defaultContext(grant,signal):requested;if(!id)throw Error('A sessionId is required');await authorized(grant,id,signal);return id},id=>authorized(grant,id,signal),(id,input,work)=>unique(grant,id,input,work)),
    app_upload:tool({description:'Upload a binary input into the authorized workspace in sequential chunks up to 256 KiB. Keep uploadId, path, MIME, totalBytes and full-file SHA-256 constant. Use final: true on the last chunk. Retrying the same chunk is safe; changed bytes are rejected. Router inputs stay in its temporary workspace. Files are encrypted locally; no OS path access.',inputSchema:mcpUploadSchema,execute:async input=>{const id=grant.application!.mode==='router'?await defaultContext(grant,signal):input.sessionId;if(!id)throw Error('A sessionId is required');await authorized(grant,id,signal);return uploadMCPFile(grant,id,input,signal)}}),
    app_conversation:applicationConversationTool(grant,signal,id=>authorized(grant,id,signal),(id,input,work)=>unique(grant,id,input,work)),
    app_contexts:tool({description:'List, create, inspect, configure or permanently delete authorized root chat workspaces. Shadow mode can access only this endpoint’s temporary workspaces and cannot retain them. No credentials, protected locked chats or raw child sandboxes. New workspaces have no implicit chat history, global system prompt, linked folder or knowledge collection.',inputSchema:z.object({action:z.enum(['list','create','get','configure','delete']),sessionId:idSchema.optional(),name:z.string().min(1).max(100).optional(),temporary:z.boolean().optional(),settings:optionsSchema.optional(),systemPrompt:z.string().max(64000).optional(),confirmDelete:z.boolean().optional(),offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(50),request_id:z.string().min(1).max(128).optional()}).strict(),execute:async input=>{
      await live(grant,signal)
      if(input.action==='list'){
        const own=await owner(grant),all=await entries(),items=[]
        const candidates=app.mode==='full'?await rendererApplication.sessions.repository.meta.getAllIncludingHidden():all.filter(item=>item.owner===own).map(item=>({id:item.id}))
        for(const item of candidates.slice(input.offset,input.offset+input.limit)){try{const header=await authorized(grant,item.id,signal);items.push({id:header.id,name:header.name,temporary:all.some(entry=>entry.id===header.id),provider:header.settings?.provider,modelId:header.settings?.modelId})}catch{/* Locked or foreign entries reveal no names. */}}
        return {items,nextOffset:input.offset+input.limit<candidates.length?input.offset+input.limit:null}
      }
      if(input.action==='create'){
        if(app.mode==='full'&&!app.manageChats)throw Error('Creating chats is not granted')
        if(!input.request_id)throw Error('Creation requires a stable request_id; do not retry with a new ID after an ambiguous failure')
        return unique(grant,'create:'+input.request_id,input,async()=>({sessionId:await createContext(grant,input,signal),temporary:app.mode!=='full'||input.temporary!==false}))
      }
      if(!input.sessionId)throw Error('A sessionId is required')
      const header=await authorized(grant,input.sessionId,signal)
      if(input.action==='get')return {id:header.id,name:header.name,settings:optionsSchema.parse(Object.fromEntries(Object.entries(header.settings||{}).filter(([key])=>key in optionsSchema.shape)))}
      if(app.mode==='full'&&!app.manageChats)throw Error('Managing chats is not granted')
      if(input.action==='delete'){
        if(!input.confirmDelete)throw Error('Permanent deletion requires confirmDelete: true')
        if((await entries()).some(item=>item.id===input.sessionId))await disposeContext(input.sessionId)
        else await rendererApplication.sessions.deleteSession(input.sessionId)
        return {deleted:true}
      }
      if(input.systemPrompt!==undefined&&!app.conversations)throw Error('Changing conversation prompts is not granted')
      const settings=constrained(grant,SessionSettingsSchema.parse({...header.settings,...input.settings}))
      await rendererApplication.sessions.updateSessionHeader(input.sessionId,{...(input.name?{name:input.name}:{}),settings})
      if(input.systemPrompt!==undefined)await rendererApplication.sessions.setSessionSystemPrompt(input.sessionId,input.systemPrompt)
      return {configured:true}
    }}),
    app_context_tools:tool({description:'Discover the actual permitted tools and JSON schemas for an authorized workspace. Call app_call with one of these names. Agent tools keep their existing guardian and depth boundaries.',inputSchema:z.object({sessionId:idSchema}).strict(),execute:async({sessionId})=>{await authorized(grant,sessionId,signal);return (await localMCPTools(bound(grant,sessionId))).filter(member=>localMCPAllows(grant.permissions,member.name,member.name==='session_file'?{action:grant.permissions.readFiles?'list':'write'}:{}))}}),
    app_call:tool({description:'Run a discovered tool in one authorized root workspace. Grants apply at execution, including agent, model, studio, search and file permissions. Paid calls require a stable request_id. Reuse that ID to retrieve the same outcome; do not create a new ID after an ambiguous timeout. A failed operation is not automatically retried.',inputSchema:z.object({sessionId:idSchema,name:z.string().min(1).max(200),arguments:z.record(z.string(),z.unknown()).default({}),request_id:z.string().min(1).max(128)}).strict(),execute:async input=>{
      await authorized(grant,input.sessionId,signal)
      if(!localMCPAllows(grant.permissions,input.name,input.arguments))throw Error('This action exceeds the endpoint permissions')
      const perform=()=>handleSessionLocalMCP({id:crypto.randomUUID(),operation:'call_tool',grant:bound(grant,input.sessionId),name:input.name,arguments:input.arguments,callId:'application:'+input.request_id},signal)
      return localMCPObservation(input.name,input.arguments)?perform():unique(grant,'call:'+input.request_id,input,perform)
    }}),
    app_resources:tool({description:'List saved files and generations or read a bounded range of one authorized resource. Router mode uses its internal temporary workspace. Read does not delete: fetch every chunk, then explicitly call app_cleanup. No regeneration to recover a saved result.',inputSchema:z.object({sessionId:idSchema.optional(),action:z.enum(['list','read']),resourceId:z.string().max(1024).optional(),version:z.string().max(128).optional(),offset:z.number().int().min(0).default(0),length:z.number().int().min(1).max(256*1024).default(256*1024)}).strict(),execute:async input=>{
      const id=app.mode==='router'?await defaultContext(grant,signal):input.sessionId
      if(!id)throw Error('A sessionId is required');await authorized(grant,id,signal,true)
      return (await import('./resource-transfer')).transferMCPResource(id,input,signal)
    }}),
    app_cleanup:tool({description:'Permanently delete this endpoint’s selected temporary workspace, generated media and worker descendants after retrieving the outputs. Omitting sessionId deletes all of this endpoint’s temporary workspaces. Existing user chats and other endpoints are never removed. A failed cleanup remains queued and can be retried.',inputSchema:z.object({sessionId:idSchema.optional()}).strict(),execute:async input=>{
      if(!input.sessionId&&[...(active.get(grant.token)||[])].some(item=>!item.id))throw Error('Wait for workspace creation before cleanup')
      const own=await owner(grant),items=(await entries()).filter(item=>item.owner===own&&(!input.sessionId||item.id===input.sessionId))
      if(input.sessionId&&!items.length)throw Error('This endpoint does not own that temporary workspace')
      for(const item of items){await live(grant,signal);await disposeContext(item.id)}return {deleted:items.length}
    }}),
  }
}
export async function handleApplicationMCP(request:LocalMCPRequest,signal:AbortSignal):Promise<unknown>{
  const grant=request.grant;await live(grant,signal)
  if(request.operation==='list_resources')return [] // No automatic enumeration of app data.
  if(request.operation==='read_resource')throw Error('Use app_resources with an authorized context')
  let definitions=appTools(grant,signal)
  if(grant.permissions.knowledge&&grant.application?.mode!=='router'&&grant.application?.knowledgeCollectionIds?.length)Object.assign(definitions,await(await import('./knowledge')).applicationKnowledgeTools(grant,signal,()=>live(grant,signal)))
  if(grant.application!.mode==='router'){
    const modelRoute=request.operation==='list_tools'||['app_models','app_model','venice_image','venice_media'].includes(request.name||'')
    const id=modelRoute?await defaultContext(grant,signal):'',scoped=bound(grant,id),listed=modelRoute?await localMCPTools(scoped):[]
    definitions=Object.fromEntries(Object.entries(definitions).filter(([name])=>['app_resources','app_cleanup','app_upload','venice_studio'].includes(name)))
    for(const member of listed){
      if(!['app_model','app_models','venice_image','venice_media'].includes(member.name)||!localMCPAllows(grant.permissions,member.name))continue
      const paid=member.name!=='app_models',schema=structuredClone(member.inputSchema)
      if(paid){schema.properties={...(schema.properties as object),request_id:{type:'string',minLength:1,maxLength:128}};if(member.name==='app_model')schema.required=[...((schema.required as string[])||[]),'request_id']}
      definitions[member.name]=tool({description:member.description+(paid?' Supply a stable request_id for generation or writes. Status/catalog requests remain fresh.':''),inputSchema:validatedToolSchema(schema),execute:async(input:any)=>{
        const {request_id,...args}=input
        const work=()=>handleSessionLocalMCP({...request,id:crypto.randomUUID(),operation:'call_tool',grant:scoped,name:member.name,arguments:args,callId:'router:'+request_id},signal)
        if(localMCPObservation(member.name,args))return work()
        if(!z.string().min(1).max(128).safeParse(request_id).success)throw Error('A stable request_id is required for a paid operation')
        return unique(grant,'router:'+request_id,{name:member.name,args,sessionId:id},work)
      }})
    }
  }
  definitions=Object.fromEntries(Object.entries(definitions).filter(([name])=>localMCPGrantAllows(grant,name)))
  if(request.operation==='list_tools')return Promise.all(Object.entries(definitions).map(async([name,definition])=>({name,description:definition.description,inputSchema:await asSchema(definition.inputSchema).jsonSchema})))
  if(request.operation!=='call_tool'||!request.name||!localMCPGrantAllows(grant,request.name,request.arguments))throw Error('This operation exceeds the endpoint permissions')
  const member=definitions[request.name];if(!member?.execute)throw Error('This application tool is unavailable')
  const validated=await asSchema(member.inputSchema).validate?.(request.arguments||{})
  if(!validated?.success)throw Error('Invalid application tool arguments')
  const input=validated.value as Record<string,unknown>,destructive=request.name==='app_cleanup'||request.name==='app_contexts'&&input.action==='delete'
  const target=request.name==='app_cleanup'?undefined:grant.application!.mode==='router'?await defaultContext(grant,signal):typeof input.sessionId==='string'?input.sessionId:undefined
  if(target)await authorized(grant,target,signal,request.name==='app_resources')
  if(target&&closing.has(target))throw Error('This workspace is being cleaned up')
  const items=active.get(grant.token)||new Set<{id?:string;work:Promise<unknown>}>();active.set(grant.token,items)
  const pending=Promise.resolve().then(()=>member.execute!(validated.value,{toolCallId:request.callId||request.id,messages:[],abortSignal:signal,context:{}}))
  const operation={id:target,work:pending};if(!destructive)items.add(operation)
  try{const result=await pending;await live(grant,signal);return result}finally{items.delete(operation);if(!items.size)active.delete(grant.token)}

}
