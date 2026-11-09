import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import NiceModal from '@ebay/nice-modal-react'
import { ModelProviderEnum,type ProviderSettings } from '@shared/types'
import { subscriptionDefaultModels } from '@shared/oauth/chatgpt-model-catalog'
import { ChatImageApproval,type ChatImageChoice } from '@/components/collaboration/ChatImageApproval'
import { settingsStore } from '@/stores/settingsStore'
import { getImageGenerationService,startImageGeneration } from '@/stores/imageGenerationActions'
import { queueImageTaskCompletion,queueImageTaskCompletionError } from '@/packages/chatbox-cli/image-task-follow-up'
import { routeSharedDecision,assertSharedTurn } from '@/packages/collaboration/bridge'
import { installedVaultFor } from '@/packages/vault/runtime'
import { listSessionResources,readSessionResource } from '@/packages/session-resources/service'
import platform from '@/platform'
import { b64 } from '@/packages/collaboration/crypto'
import { canShareAsset } from '@shared/collaboration'

const activeCalls=new Map<string,Promise<unknown>>()
async function onceImageCall<T>(key:string,generate:boolean,run:()=>Promise<T>):Promise<T>{if(!generate)return run();const active=activeCalls.get(key);if(active)return active as Promise<T>;const work=run();activeCalls.set(key,work);try{return await work}finally{activeCalls.delete(key)}}

export function subscriptionImageModels(settings?:ProviderSettings){
  const models = new Map(subscriptionDefaultModels().filter(model=>model.type==='image').map(model=>[model.modelId,model]))
  for(const model of settings?.models||[])if(model.type==='image')models.set(model.modelId,model)
  return [...models.values()].filter(model=>!settings?.excludedModels?.includes(model.modelId))
}
export function subscriptionImageToolAvailable(settings?:ProviderSettings){return !!settings?.oauth&&settings.subscriptionChatImages!==false&&subscriptionImageModels(settings).length>0}
export function subscriptionChatImageTools(sessionId:string,requester='owner',turnId='external'):ToolSet{
  const provider=()=>settingsStore.getState().providers?.[ModelProviderEnum.OpenAISubscription]
  if(!subscriptionImageToolAvailable(provider()))return {}
  const input=z.object({action:z.enum(['models','generate','status']),prompt:z.string().trim().min(1).max(20000).optional(),modelId:z.string().max(200).optional(),count:z.number().int().min(1).max(4).optional(),aspectRatio:z.enum(['auto','1:1','3:2','2:3']).optional(),referencePaths:z.array(z.string().max(240)).max(4).optional(),recordId:z.string().max(200).optional()}).strict()
  return {chatgpt_image:tool({description:'Generate/edit images using the connected ChatGPT subscription. Prefer this tool for images in a ChatGPT subscription chat unless the user explicitly selects Venice. models lists configured image IDs/endpoints. generate always asks for confirmation and returns a durable background record, not the final image. References are listed image paths in this session. Use status to check the record, never repeat a failed generation without a new user request. Never substitute a paid API or another provider automatically.',inputSchema:input,execute:async(request,options)=>onceImageCall(sessionId+':'+options.toolCallId,request.action==='generate',async()=>{
    assertSharedTurn(sessionId,requester);await installedVaultFor(platform)?.projects.assertSession(sessionId);options.abortSignal?.throwIfAborted()
    if(!subscriptionImageToolAvailable(provider()))throw Error('ChatGPT image generation is disabled or disconnected')
    const models=subscriptionImageModels(provider())
    if(request.action==='models')return models.map(model=>({id:model.modelId,name:model.nickname||model.modelId,endpoint:model.subscriptionEndpoint||'image-tool'}))
    const service=getImageGenerationService()
    const result=(record:import('@shared/types').ImageGeneration)=>({ok:true,command:'image generate',accepted:true,background:true,recordId:record.id,status:'pending',recordStatus:record.status,startedAt:record.createdAt,wait:{mode:'callback',managedBy:'chatbox',modelShouldPoll:false},error:record.error,files:record.generatedImages.map((key,index)=>({id:'image:'+record.id+':'+key,path:'images/'+record.id+'/'+(index+1)+'.png'}))})
    if(request.action==='status'){const record=request.recordId?await service.getRecord(request.recordId):null;if(!record||record.source?.sessionId!==sessionId)throw Error('Image not found in this chat');return {...result(record),status:record.status}}
    if(!request.prompt)throw Error('An image prompt is required')
    // A replay of an accepted call must resolve to the same durable record.
    const key='subscription:image-call:'+sessionId+':'+options.toolCallId,previous=await platform.getStoreValue(key)
    if(previous){if(typeof previous!=='string')throw Error('Invalid generation metadata. Do not repeat the paid request.');const record=await service.getRecord(previous);if(!record||record.source?.sessionId!==sessionId)throw Error('The previous generation is unavailable. A new approval is required; it will not be retried automatically.');return result(record)}
    const turnKey='subscription:image-turn:'+sessionId+':'+turnId,turnRecord=await platform.getStoreValue(turnKey)
    if(typeof turnRecord==='string'){const failed=await service.getRecord(turnRecord);if(failed?.status==='error')return {ok:false,failed:true,recordId:failed.id,error:failed.error,message:'Image generation failed. Explain the error and wait for a new user request before generating again.'}}
    const model=models.find(model=>model.modelId===request.modelId)||(!request.modelId?models[0]:undefined)
    if(!model)throw Error('The requested image model is not configured. List models or choose one in the approval.')
    const before=provider(),choice=await routeSharedDecision<ChatImageChoice|null>(sessionId,requester,{kind:'image',prompt:request.prompt,modelId:model.modelId,count:request.count??1,models:models.map(model=>({id:model.modelId,name:model.nickname||model.modelId,ratios:['auto','1:1','3:2','2:3']}))},signal=>NiceModal.show(ChatImageApproval,{models:models.map(model=>({id:model.modelId,name:model.nickname||model.modelId})),request:{modelId:model.modelId,prompt:request.prompt!,count:request.count??1,aspectRatio:request.aspectRatio??'auto'},signal}) as Promise<ChatImageChoice|null>,value=>value,value=>value&&typeof value==='object'&&'modelId'in value?value:null,options.abortSignal)
    if(!choice)return {cancelled:true,message:'The user declined image generation. Do not ask again without a new request.'}
    assertSharedTurn(sessionId,requester);options.abortSignal?.throwIfAborted()
    if(provider()!==before||!subscriptionImageModels(provider()).some(model=>model.modelId===choice.modelId))throw Error('The image provider settings changed. Review the request again.')
    const references:string[]=[]
    for(const path of request.referencePaths||[]){const item=(await listSessionResources(sessionId,options.abortSignal)).items.find(file=>file.path===path);if(!item||!/^image\/(png|jpeg|webp)$/.test(item.mime))throw Error('Choose a PNG, JPEG or WebP reference from this session');const vault=installedVaultFor(platform);if(vault&&item.key&&!canShareAsset(await vault.projects.sessionScope(sessionId)||undefined,(await vault.assets.header(item.key))?.scope))throw Error('This creation is individually protected and cannot be shared with this chat');const {bytes}=await readSessionResource(sessionId,item);try{if(bytes.length>10*1024*1024)throw Error('References: PNG, JPEG or WebP, up to 10 MB');const value=b64(bytes).replaceAll('-','+').replaceAll('_','/');references.push('data:'+item.mime+';base64,'+value+'='.repeat((4-value.length%4)%4))}finally{bytes.fill(0)}}
    const access=installedVaultFor(platform)?.projects;await access?.assertSession(sessionId);assertSharedTurn(sessionId,requester)
    const handle=await startImageGeneration({prompt:choice.prompt,model:{provider:ModelProviderEnum.OpenAISubscription,modelId:choice.modelId},imageGenerateNum:choice.count,aspectRatio:choice.aspectRatio,referenceImages:references,protection:await access?.sessionScope(sessionId)||undefined,source:{type:'chatbox_cli',sessionId,toolCallId:options.toolCallId}},{onRecordCreated:async record=>{await platform.setStoreValue(key,record.id);await platform.setStoreValue(turnKey,record.id)}})
    void handle.completion.then(record=>{if(record)queueImageTaskCompletion(record,{sessionId,toolCallId:options.toolCallId},handle.startedAt)}).catch(error=>queueImageTaskCompletionError(handle.recordId,handle.startedAt,{sessionId,toolCallId:options.toolCallId},error))
    const record=await service.getRecord(handle.recordId);if(!record)throw Error('The accepted image request could not be read. Do not start another generation.');return result(record)
  })})}
}
