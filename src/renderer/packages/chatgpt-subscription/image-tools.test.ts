import { beforeEach,expect,it,vi } from 'vitest'
const state=vi.hoisted(()=>({provider:{} as any,store:new Map<string,unknown>(),records:new Map<string,any>(),start:vi.fn(),approve:vi.fn(),completed:vi.fn(),assert:vi.fn(async()=>{})}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({providers:{'openai-sub-unofficial':state.provider}})}}))
vi.mock('@/stores/imageGenerationActions',()=>({getImageGenerationService:()=>({getRecord:async(id:string)=>state.records.get(id)||null}),startImageGeneration:(...args:any[])=>state.start(...args)}))
vi.mock('@ebay/nice-modal-react',()=>({default:{create:(value:unknown)=>value,show:(...args:any[])=>state.approve(...args)}}))
vi.mock('@/components/collaboration/ChatImageApproval',()=>({ChatImageApproval:'image-confirmation'}))
vi.mock('@/packages/chatbox-cli/image-task-follow-up',()=>({queueImageTaskCompletion:(...args:any[])=>state.completed(...args),queueImageTaskCompletionError:vi.fn()}))
vi.mock('@/packages/collaboration/bridge',()=>({assertSharedTurn:vi.fn(),routeSharedDecision:async(_id:string,_actor:string,_input:unknown,local:any)=>local(new AbortController().signal)}))
vi.mock('@/packages/vault/runtime',()=>({installedVaultFor:()=>({projects:{assertSession:state.assert,sessionScope:async()=> 'private-project'}})}))
vi.mock('@/packages/session-resources/service',()=>({listSessionResources:async()=>({items:[]}),readSessionResource:vi.fn()}))
vi.mock('@/platform',()=>({default:{getStoreValue:async(key:string)=>state.store.get(key),setStoreValue:async(key:string,value:unknown)=>state.store.set(key,value)}}))
import { subscriptionChatImageTools,subscriptionImageModels,subscriptionImageToolAvailable } from './image-tools'
import { getAcceptedImageBackgroundTaskResult,hasAcceptedCallbackBackgroundTaskResult } from '@shared/image-background-task-result'
const context={toolCallId:'image-call',messages:[],abortSignal:new AbortController().signal,context:{}}
beforeEach(()=>{
  vi.clearAllMocks();state.store.clear();state.records.clear();state.provider={oauth:{accessToken:'local-marker'},models:[{modelId:'chatgpt-image-auto',type:'image'},{modelId:'custom-image',type:'image',subscriptionEndpoint:'images'},{modelId:'text',type:'chat'}]}
  state.approve.mockResolvedValue({modelId:'chatgpt-image-auto',prompt:'Approved prompt',count:1,aspectRatio:'1:1'})
  state.start.mockImplementation(async(params:any,options:any)=>{const record={id:'record',status:'pending',createdAt:123,source:params.source,generatedImages:[],model:params.model};state.records.set(record.id,record);await options.onRecordCreated(record);return {recordId:record.id,startedAt:123,completion:Promise.resolve({...record,status:'done',generatedImages:['encrypted-image-key']})}})
})
it('exposes configured image endpoints, waits for approval and stores a host-owned durable chat/library record without a paid-provider fallback',async()=>{
  const tool=subscriptionChatImageTools('session','owner','turn').chatgpt_image!
  const models=await tool.execute!({action:'models'},context) as any[];expect(models.map(model=>model.id)).toEqual(['chatgpt-image-auto','custom-image']);expect(models[1].endpoint).toBe('images')
  const result=await tool.execute!({action:'generate',prompt:'Draw a mountain'},context)
  expect(state.approve).toHaveBeenCalledOnce();expect(state.start).toHaveBeenCalledWith(expect.objectContaining({prompt:'Approved prompt',model:{provider:'openai-sub-unofficial',modelId:'chatgpt-image-auto'},protection:'private-project',source:{type:'chatbox_cli',sessionId:'session',toolCallId:'image-call'}}),expect.anything())
  expect(getAcceptedImageBackgroundTaskResult(result)?.recordId).toBe('record');expect(hasAcceptedCallbackBackgroundTaskResult([{type:'tool-call',toolName:'chatgpt_image',result}])).toBe(true)
  await tool.execute!({action:'generate',prompt:'Do not repeat'},context);expect(state.start).toHaveBeenCalledOnce();expect(state.approve).toHaveBeenCalledOnce();expect(state.completed).toHaveBeenCalledOnce()
})
it('deduplicates simultaneous replays and refuses automatic retries after a failed image in the same user turn',async()=>{
  const tool=subscriptionChatImageTools('session','owner','turn').chatgpt_image!
  await Promise.all([tool.execute!({action:'generate',prompt:'Draw'},context),tool.execute!({action:'generate',prompt:'Draw'},context)]);expect(state.start).toHaveBeenCalledOnce()
  state.records.get('record').status='error';state.records.get('record').error='Subscription allowance exceeded'
  expect(await tool.execute!({action:'generate',prompt:'Try again'},{...context,toolCallId:'another'})).toMatchObject({ok:false,failed:true,error:'Subscription allowance exceeded'});expect(state.approve).toHaveBeenCalledOnce()
})
it('honors disable/disconnect, rejects an unconfigured ID and keeps cancellation free of generation',async()=>{
  state.provider.subscriptionChatImages=false;expect(subscriptionImageToolAvailable(state.provider)).toBe(false);expect(subscriptionChatImageTools('session')).toEqual({})
  state.provider.subscriptionChatImages=true;delete state.provider.oauth;expect(subscriptionChatImageTools('session')).toEqual({});state.provider.oauth={accessToken:'marker'}
  const tool=subscriptionChatImageTools('session').chatgpt_image!;await expect(tool.execute!({action:'generate',prompt:'Draw',modelId:'unconfigured'},context)).rejects.toThrow('not configured')
  state.approve.mockResolvedValue(null);expect(await tool.execute!({action:'generate',prompt:'Draw'},context)).toMatchObject({cancelled:true});expect(state.start).not.toHaveBeenCalled();expect(subscriptionImageModels(state.provider)).toHaveLength(2)
})
it('keeps the native virtual image model available with an empty or text-only saved model list',()=>{
  for(const models of [[],[{modelId:'custom-text',type:'chat'}]]){
    state.provider.models=models
    expect(subscriptionImageToolAvailable(state.provider)).toBe(true)
    expect(subscriptionImageModels(state.provider).map(model=>model.modelId)).toEqual(['chatgpt-image-auto'])
  }
  state.provider.excludedModels=['chatgpt-image-auto']
  expect(subscriptionImageToolAvailable(state.provider)).toBe(false)
})
