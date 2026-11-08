import { asSchema,tool,type ToolSet } from 'ai'
import { z } from 'zod'
import { SystemProviders } from '@shared/defaults'
import { isUsingOAuth,mergeSharedOAuthProviderSettings } from '@shared/oauth'
import { ModelProviderEnum,type ProviderModelInfo } from '@shared/types'
import { projectVeniceModels } from '@shared/providers/definitions/models/venice/model-selection'
import { resolveVeniceSettings } from '@shared/providers/definitions/models/venice/options'
import { effectiveTextPrivacy } from '@shared/providers/definitions/models/venice/privacy'
import { isTextResource } from '@shared/session-resources'
import { localMCPAllows,parseSessionResourceURI,sessionResourceURI,type LocalMCPGrant,type LocalMCPRequest,type LocalMCPTool } from '@shared/local-mcp'
import { createModel } from '@/adapters'
import { rendererApplication } from '@/app/renderer-application'
import { settingsStore } from '@/stores/settingsStore'
import { getSessionSettings } from '@/stores/session/session-settings'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { buildSessionWorkspaceTools } from '@/packages/session-resources/tools'
import { sessionFiles } from '@/packages/session-resources/files'
import { listSessionResources,readSessionResource } from '@/packages/session-resources/service'
import { veniceChatTools } from '@/packages/venice/tools'
import { mcpController } from '@/packages/mcp/controller'
import { buildWebSearchTools,parseLinkTool } from '@/packages/model-calls/toolsets/web-search'
import platform from '@/platform'

const forwarding=new Set<string>()
async function assertChat(grant:LocalMCPGrant){await vaultRuntimeFor(platform).projects.assertSession(grant.sessionId);if(!await rendererApplication.sessions.getSessionHeader(grant.sessionId))throw new Error('The shared chat was deleted')}
async function catalog(grant:LocalMCPGrant){
  const global=settingsStore.getState().getSettings(),session=await getSessionSettings(grant.sessionId)
  const base=global.providers?.venice?.venice,privacy=resolveVeniceSettings(base,undefined,session.veniceProfile,session.veniceSecurity)
  const restrict=session.provider===ModelProviderEnum.Venice&&(effectiveTextPrivacy(privacy)!=='standard'||privacy.privacyFilter&&privacy.privacyFilter!=='all')
  const output:{provider:string;providerName:string;modelId:string;name:string;capabilities:ProviderModelInfo['capabilities'];privacy:unknown;uncensored:unknown;secure:unknown}[]=[]
  for(const provider of [...SystemProviders(),...(global.customProviders??[])]){
    if(restrict&&provider.id!==ModelProviderEnum.Venice)continue
    if(provider.id===ModelProviderEnum.Venice&&base?.enabled===false)continue
    const saved=mergeSharedOAuthProviderSettings(provider.id,global.providers)
    const local=provider.isCustom||provider.id===ModelProviderEnum.Ollama||provider.id===ModelProviderEnum.LMStudio
    if(!(saved.apiKey||isUsingOAuth(saved,platform.type)||provider.id===ModelProviderEnum.ChatboxAI&&global.licenseKey||provider.id===ModelProviderEnum.Bedrock&&saved.accessKey&&saved.secretKey||local&&saved.models?.length))continue
    let models=saved.models??provider.defaultSettings?.models??[]
    if(provider.id===ModelProviderEnum.Venice)models=projectVeniceModels(models,saved.catalogModels,saved.venice,saved.excludedModels)
    for(const model of models){if(model.type&&model.type!=='chat')continue
      const metadata=model.vendorMetadata,capabilities=metadata?.capabilities as Record<string,unknown>|undefined
      if(provider.id===ModelProviderEnum.Venice&&effectiveTextPrivacy(privacy)==='e2ee'&&capabilities?.supportsE2EE!==true)continue
      if(provider.id===ModelProviderEnum.Venice&&effectiveTextPrivacy(privacy)==='tee'&&capabilities?.supportsTeeAttestation!==true&&capabilities?.supportsE2EE!==true)continue
      output.push({provider:provider.id,providerName:provider.name,modelId:model.modelId,name:model.nickname||model.modelId,capabilities:model.capabilities,privacy:metadata?.privacy,uncensored:metadata?.uncensored,secure:capabilities?.supportsE2EE===true||capabilities?.supportsTeeAttestation===true})
    }
  }
  return output.slice(0,2000)
}
async function modelTools(grant:LocalMCPGrant):Promise<ToolSet>{
  if(!grant.permissions.models)return {}
  return {
    app_models:tool({description:'List configured text models available to this shared chat, respecting its Venice privacy restrictions. Returns capabilities, never credentials.',inputSchema:z.object({}).strict(),execute:()=>catalog(grant)}),
    app_model:tool({
      description:'Call one configured text model with explicit text messages. Uses this chat’s privacy settings and the app’s stored provider credentials, without returning the credentials or sending chat history automatically. Provider charges may apply. Human approval is required unless automatic model calls were explicitly granted when sharing this chat. No tool recursion or implicit fallback model.',
      inputSchema:z.object({provider:z.string().max(128),modelId:z.string().max(256),messages:z.array(z.object({role:z.enum(['system','user','assistant']),content:z.string().max(64000)}).strict()).min(1).max(20),maxOutputTokens:z.number().int().min(1).max(8192).default(4096)}).strict(),
      execute:async(input,options)=>{
        options.abortSignal?.throwIfAborted();const models=await catalog(grant)
        const selected=models.find(model=>model.provider===input.provider&&model.modelId===input.modelId)
        if(!selected)throw new Error('This model is not available to the shared chat')
        const configuration=settingsStore.getState().getSettings().providers?.[input.provider]
        if(!grant.permissions.automaticModels){
          const {requestExternalModelApproval}=await import('./model-approval')
          if(!await requestExternalModelApproval(grant,input,options.abortSignal))throw new Error('External model call was not approved')
        }
        await assertChat(grant);options.abortSignal?.throwIfAborted()
        // Re-evaluate after approval: settings or privacy may have changed while the dialog was open.
        if(settingsStore.getState().getSettings().providers?.[input.provider]!==configuration||!(await catalog(grant)).some(model=>model.provider===input.provider&&model.modelId===input.modelId))throw new Error('The model configuration changed. Review the request again.')
        const settings=await getSessionSettings(grant.sessionId),model=await createModel({...settings,provider:input.provider,modelId:input.modelId,maxTokens:input.maxOutputTokens})
        const result=await model.chat(input.messages,{sessionId:grant.sessionId,signal:options.abortSignal,maxSteps:1}).catch(()=>{throw new Error(options.abortSignal?.aborted?'Model call cancelled':'Model call failed. Check the provider in the app before retrying.')})
        await assertChat(grant)
        return {provider:input.provider,modelId:input.modelId,text:result.contentParts?.filter(part=>part.type==='text').map(part=>part.text).join('\n')||'',usage:result.usage}
      },
    }),
  }
}
async function toolsFor(grant:LocalMCPGrant){
  await assertChat(grant)
  const tools:ToolSet={}
  if(grant.permissions.readFiles||grant.permissions.writeFiles)Object.assign(tools,await buildSessionWorkspaceTools(grant.sessionId))
  if(!grant.permissions.execute){delete tools.session_js;delete tools.session_python}
  if(grant.permissions.venice)Object.assign(tools,veniceChatTools(grant.sessionId))
  if(grant.permissions.search){Object.assign(tools,buildWebSearchTools());tools.parse_link=parseLinkTool}
  Object.assign(tools,await modelTools(grant))
  if(grant.permissions.forwardMCP){
    const permitted=new Set<string>()
    for(const {config}of mcpController.servers.values()){
      if(config.transport.type==='http')try{const url=new URL(config.transport.url),self=new URL(grant.url);if(['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.port===self.port)continue}catch{continue}
      permitted.add(config.id)
    }
    for(const [name,member]of Object.entries(mcpController.getAvailableTools(permitted)))tools['mcp_'+name]=member
  }
  if(grant.permissions.multiAgent){
    const {buildExternalMultiAgentTools}=await import('@/packages/multi-agent/runtime')
    const shared=Object.fromEntries(Object.entries(tools).filter(([name])=>name==='session_file'?grant.permissions.readFiles||grant.permissions.writeFiles:localMCPAllows(grant.permissions,name)))
    Object.assign(tools,buildExternalMultiAgentTools(grant,shared,async()=>{
      await assertChat(grant)
      const current=await window.electronAPI.invoke('local-mcp:control','status') as import('@shared/local-mcp').LocalMCPState
      if(!current.running||current.token!==grant.token||current.sessionId!==grant.sessionId||JSON.stringify(current.permissions)!==JSON.stringify(grant.permissions))throw Error('Local MCP access was revoked')
    }))
  }
  return tools
}
export async function localMCPTools(grant:LocalMCPGrant):Promise<LocalMCPTool[]>{
  const tools=await toolsFor(grant),result:LocalMCPTool[]=[]
  for(const [name,member]of Object.entries(tools)){
    const schema=structuredClone(await asSchema(member.inputSchema).jsonSchema) as LocalMCPTool['inputSchema']
    if(name==='session_file'){
      const properties=schema.properties as Record<string,any>|undefined
      if(properties?.action?.enum)properties.action.enum=properties.action.enum.filter((action:string)=>localMCPAllows(grant.permissions,name,{action}))
    }
    result.push({name,description:typeof member.description==='function'?member.description({context:{}}):member.description,inputSchema:schema})
  }
  if(result.length>256)throw new Error('Too many shared MCP tools. Disable some connected services.')
  return result
}
export async function handleLocalMCP(request:LocalMCPRequest,signal:AbortSignal){
  const grant=request.grant;await assertChat(grant);signal.throwIfAborted()
  if(request.operation==='list_tools')return localMCPTools(grant)
  if(request.operation==='list_resources'){
    if(!grant.permissions.readFiles||(await sessionFiles.index(grant.sessionId)).toolsEnabled===false)return []
    return (await listSessionResources(grant.sessionId,signal)).items.map(item=>({uri:sessionResourceURI(grant.sessionId,item.id),name:item.path,mimeType:item.mime,size:item.bytes}))
  }
  if(request.operation==='read_resource'){
    if(!grant.permissions.readFiles)throw new Error('File reading is not allowed')
    if((await sessionFiles.index(grant.sessionId)).toolsEnabled===false)throw new Error('Session workspace tools are disabled')
    const resourceId=parseSessionResourceURI(grant.sessionId,request.uri||''),item=(await listSessionResources(grant.sessionId,signal)).items.find(item=>item.id===resourceId)
    if(!item)throw new Error('Session file not found')
    const {bytes}=await readSessionResource(grant.sessionId,item)
    try{signal.throwIfAborted();if(bytes.length>8*1024*1024)throw new Error('This resource exceeds the MCP transfer limit. Export it from the explorer.')
      if(isTextResource(item))return {contents:[{uri:request.uri,mimeType:item.mime,text:new TextDecoder().decode(bytes)}]}
      let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte)
      return {contents:[{uri:request.uri,mimeType:item.mime,blob:btoa(binary)}]}
    }finally{bytes.fill(0)}
  }
  if(request.operation!=='call_tool'||!request.name||!localMCPAllows(grant.permissions,request.name,request.arguments))throw new Error('This action is outside the shared chat permissions')
  const member=(await toolsFor(grant))[request.name];if(!member?.execute)throw new Error('This tool is unavailable')
  const schema=asSchema(member.inputSchema),validated=await schema.validate?.(request.arguments??{})
  if(!validated?.success)throw new Error('Invalid MCP tool arguments')
  const forward=request.name.startsWith('mcp_')
  if(forward&&forwarding.has(grant.token))throw new Error('Recursive MCP forwarding is blocked')
  if(forward)forwarding.add(grant.token)
  try{return await member.execute(validated.value,{toolCallId:request.callId||request.id,messages:[],abortSignal:signal,context:{}})}
  finally{if(forward)forwarding.delete(grant.token)}
}
