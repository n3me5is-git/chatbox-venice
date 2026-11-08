import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import NiceModal from '@ebay/nice-modal-react'
import { buildVeniceMediaTools } from '@shared/providers/definitions/models/venice/tools'
import { buildVeniceImageTools, type ImageChoice } from '@shared/providers/definitions/models/venice/image-tools'
import { internalVeniceMCP } from '@shared/providers/definitions/models/venice/internal-mcp'
import { ModelProviderEnum } from '@shared/types'
import { requestSessionImageChoice } from './image-approval'
import { syncSessionApprovalScope } from './approval-scope'
import { sessionApprovals, type ApprovalMode } from './session-approvals'
import { VeniceMediaApproval } from '@/components/venice/VeniceMediaApproval'
import { veniceConfiguration, veniceMediaService } from './service'
import { providerImageModelsQueryOptions } from '@/packages/image-model-catalog'
import { queryClient } from '@/stores/queryClient'
import { getImageGenerationService, startImageGeneration } from '@/stores/imageGenerationActions'
import { queueImageTaskCompletion, queueImageTaskCompletionError } from '@/packages/chatbox-cli/image-task-follow-up'
import platform from '@/platform'
import { installedVaultFor } from '@/packages/vault/runtime'
import { VeniceImageApproval } from '@/components/venice/VeniceImageApproval'
import { GenerationRetryGate } from '@shared/generation-retry'
import { requestGenerationRetry } from '@/components/venice/GenerationFailure'
import { routeSharedDecision,isSharedChat,assertSharedTurn } from '@/packages/collaboration/bridge'
import {privacyAllowed} from '@shared/providers/definitions/models/venice/privacy'
import {quickModelPrice} from '@shared/providers/definitions/models/venice/pricing'
const inFlight = new Map<string, Promise<unknown>>()
const retryGate=new GenerationRetryGate()
export function veniceChatTools(sessionId: string,turnId='external',requester='owner',decisionSessionId=sessionId) {
  syncSessionApprovalScope(sessionId)
  const authorizations = new WeakMap<ImageChoice, {scope: string; revision: number; automatic: boolean}>()
  const options = () => veniceConfiguration().options
  const retry=(failure:Parameters<typeof requestGenerationRetry>[0],signal?:AbortSignal)=>routeSharedDecision(decisionSessionId,requester,{kind:'confirm',title:'The previous generation failed',detail:failure.model+'\n'+failure.error+'\n'+ft('Retry starts a new paid generation. Approve to retry or reject to skip.')},signal=>requestGenerationRetry(failure,signal),value=>value,value=>value===true,signal)
  if (options().enabled === false || options().chatToolsEnabled === false || !veniceConfiguration().apiKey) return {}
  const images = async () => (await queryClient.fetchQuery(providerImageModelsQueryOptions(ModelProviderEnum.Venice, veniceConfiguration()))).filter(model=>privacyAllowed(model.vendorMetadata,options().privacyFilter))
  const latestImage=async()=>{
    await installedVaultFor(platform)?.projects.assertSession(sessionId)
    let cursor:number|null=0
    for(let pageNumber=0;cursor!==null&&pageNumber<20;pageNumber++){
      const page=await getImageGenerationService().getPage(cursor,100),record=page.items.find(record=>record.source?.sessionId===sessionId)
      if(record)return record
      cursor=page.nextCursor
    }
  }
  const saved = async (callId: string) => {
    const id = await platform.getStoreValue(`venice:image-call:${sessionId}:${callId}`)
    if (!id) return null
    if (typeof id !== 'string') throw new Error(ft("Invalid generation metadata. Do not repeat the paid request."))
    const record = await getImageGenerationService().getRecord(id)
    if (!record || record.source?.sessionId !== sessionId) throw new Error(ft("The previous generation is unavailable. A new approval is required; it will not be retried automatically."))
    return { ok: true, command: 'image generate', accepted: true, background: true, recordId: record.id, status: 'pending', startedAt: record.createdAt, wait: { mode: 'callback', managedBy: 'chatbox', modelShouldPoll: false } }
  }
  const imageTools = buildVeniceImageTools({
    models: async () => (await images()).map(row => ({ modelId: row.modelId, name: row.displayName, capabilities: row.capabilities, metadata: row.vendorMetadata })),
    choose: async (request, signal) => {
      const failure=await latestImage()
      if(failure?.status==='error'&&!await retryGate.allow(sessionId+':'+turnId,{id:failure.id,kind:ft('Image'),model:failure.model.modelId,error:failure.error||''},value=>retry(value,signal)))return null
      const before = veniceConfiguration(); const scope = syncSessionApprovalScope(sessionId); const models = await images()
      const policy=isSharedChat(decisionSessionId)?{...sessionApprovals,allows:()=>false}:sessionApprovals
      const approved = await requestSessionImageChoice(sessionId, request, models, request => routeSharedDecision<ImageChoice & {approvalMode?:ApprovalMode}|null>(decisionSessionId,requester,{kind:'image',prompt:request.prompt,modelId:request.modelId,count:request.count,models:models.map(model=>({id:model.modelId,name:model.displayName,requiresReferences:!!model.capabilities?.inputReferences?.min,ratios:model.capabilities?.aspectRatio?.values,price:quickModelPrice({id:model.modelId,type:String(model.vendorMetadata?.veniceType||'image'),model_spec:model.vendorMetadata})}))},signal=>NiceModal.show(VeniceImageApproval,{models,request,signal,sessionId}) as Promise<ImageChoice & {approvalMode?:ApprovalMode}|null>,value=>value?{modelId:value.modelId,prompt:value.prompt,count:value.count,aspectRatio:value.aspectRatio}:null,value=>value&&typeof value==='object'&&'modelId'in value?{...value,referenceImages:[]}:null,signal),policy)
      const current = veniceConfiguration()
      if (before.apiKey !== current.apiKey || before.apiHost !== current.apiHost || scope !== syncSessionApprovalScope(sessionId)) throw new Error('Venice settings changed. Review the request again.')
      if (approved) authorizations.set(approved.choice, {scope, revision:sessionApprovals.revision(sessionId), automatic:approved.automatic})
      return approved?.choice || null
    },
    previous: async callId=>{
      const prior=await saved(callId);if(prior)return prior
      const pending=await latestImage()
      return pending&&(pending.status==='pending'||pending.status==='generating')?{recordId:pending.id,status:pending.status,message:'This chat already has an image generation in progress. Wait for its completion; do not start another paid request.'}:null
    },
    status: async id => { const record = await getImageGenerationService().getRecord(id); if (!record || record.source?.sessionId !== sessionId) throw new Error(ft("Image not found in this chat")); return { recordId: record.id, status: record.status, count: record.generatedImages.length, error: record.error,files:record.generatedImages.map((key,index)=>({id:'image:'+record.id+':'+key,path:'images/'+record.id+'/'+(index+1)+'.png'})) } },
    generate: async (choice, toolCallId) => {
      assertSharedTurn(decisionSessionId,requester)
      const authorization = authorizations.get(choice)
      if (!authorization || authorization.scope !== syncSessionApprovalScope(sessionId) || (authorization.automatic && authorization.revision !== sessionApprovals.revision(sessionId))) throw new Error('This chat approval was revoked. Review the request again.')
      const key = `${sessionId}:${toolCallId}`; const active = inFlight.get(key); if (active) return active
      const work = (async () => {
        const prior = await saved(toolCallId); if (prior) return prior
        const access=installedVaultFor(platform)?.projects;await access?.assertSession(sessionId);const protection=await access?.sessionScope(sessionId)||undefined
        assertSharedTurn(decisionSessionId,requester)
        const handle = await startImageGeneration({ protection, prompt: choice.prompt, model: { provider: 'venice', modelId: choice.modelId, ...(choice.extraBody ? { extraBody: choice.extraBody } : {}) }, imageGenerateNum: choice.count, aspectRatio: choice.aspectRatio, referenceImages: choice.referenceImages, source: { type: 'chatbox_cli', sessionId, toolCallId } }, { onRecordCreated: record => platform.setStoreValue(`venice:image-call:${sessionId}:${toolCallId}`, record.id) })
        void handle.completion.then(record => { if (record) queueImageTaskCompletion(record, { sessionId, toolCallId }, handle.startedAt) }).catch(error => queueImageTaskCompletionError(handle.recordId, handle.startedAt, { sessionId, toolCallId }, error))
        return saved(toolCallId)
      })()
      inFlight.set(key, work); try { return await work } finally { inFlight.delete(key) }
    },
  }, options)
  const scopedMedia=new Proxy(veniceMediaService,{get(target,key){const fn=Reflect.get(target,key);if(typeof fn!=='function')return fn;return async(...args:any[])=>{const access=installedVaultFor(platform)?.projects;await access?.assertSession(sessionId);if(key==='start')args[0]={...args[0],protection:await access?.sessionScope(sessionId)||undefined};assertSharedTurn(decisionSessionId,requester);return fn.apply(target,args)}}})
  const mediaTools = buildVeniceMediaTools(sessionId, scopedMedia, options, async (message, request) => {
    if(request?.action==='generate'){
      const latest=(await veniceMediaService.list()).filter(record=>record.sessionId===sessionId&&record.kind===request.kind).sort((a,b)=>b.createdAt-a.createdAt)[0]
      if(latest?.status==='error'&&!await retryGate.allow(sessionId+':'+turnId,{id:latest.id,kind:latest.kind,model:latest.model,error:latest.error||''},value=>retry(value,request.signal)))return false
    }
    const scope = syncSessionApprovalScope(sessionId)
    const descriptor = request?.action === 'generate' ? {tool:'venice_media', kind:request.kind!, model:request.model!, options:request.options || {}} : undefined
    if (descriptor && !isSharedChat(decisionSessionId) && sessionApprovals.allows(sessionId, descriptor)) return true
    const revision = sessionApprovals.revision(sessionId)
    const result = await routeSharedDecision<{approved:boolean;mode:ApprovalMode}>(decisionSessionId,requester,{kind:'confirm',title:'Venice tool approval',detail:message},signal=>NiceModal.show(VeniceMediaApproval, {message, sessionId, generation:!!descriptor, request:request?{...request,signal}:undefined}) as Promise<{approved:boolean;mode:ApprovalMode}>,value=>value.approved,value=>({approved:value===true,mode:'ask'}),request?.signal)
    if (scope !== syncSessionApprovalScope(sessionId)) throw new Error('Venice settings changed. Review the request again.')
    if (result.approved && descriptor && revision === sessionApprovals.revision(sessionId)) {
      if (result.mode !== sessionApprovals.mode(sessionId)) sessionApprovals.setMode(sessionId,result.mode)
      sessionApprovals.remember(sessionId,descriptor)
    }
    return result.approved
  })
  return internalVeniceMCP({ ...mediaTools, ...imageTools })
}
