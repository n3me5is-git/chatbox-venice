import {tool} from 'ai'
import {z} from 'zod'
import type {LocalMCPGrant} from '@shared/local-mcp'
import {localMCPModelSettings} from '@shared/local-mcp-model-policy'
import {KnowledgeModelSchema,type KnowledgeModel} from '@shared/knowledge-json'
import {KnowledgeFollowUpLimitSchema,type KnowledgeCheckSource} from '@shared/knowledge-verification'
import {knowledgeCollections} from '@/packages/knowledge-collections/service'
import {checkKnowledgeAnswer} from '@/packages/knowledge-collections/verify'
import {createReviewRetriever,readReviewSource,type ReviewSourceApproval,type ReviewSourceBinding} from '@/packages/knowledge-collections/review-sources'
import {settingsStore} from '@/stores/settingsStore'

export function mcpReviewSourceApproval(grant:LocalMCPGrant,model:KnowledgeModel,signal:AbortSignal):ReviewSourceApproval|undefined {
 if(grant.permissions.automaticModels)return
 return async(query,sources)=>{
  const {requestExternalModelApproval}=await import('./model-approval')
  const approved=await requestExternalModelApproval(grant,{
   provider:model.provider,modelId:model.model,maxOutputTokens:4096,
   messages:[
    {role:'system',content:'Source review found additional passages in the approved collections. Approve sending these passages to the verifier.'},
    {role:'user',content:JSON.stringify({query,sources})},
   ],
  },signal)
  if(!approved)throw Error('Additional source evidence was not approved')
 }
}

export function applicationKnowledgeVerifier(grant:LocalMCPGrant,signal:AbortSignal,live:()=>Promise<void>){
 return tool({description:'Assess an answer against at most 8 actual citation receipts from explicitly granted collections. Opt in to 0, 1 or 2 followUpSearches for local keyword retrieval within the collections represented by those receipts. The selected verifier may receive additional approved passages. Optional correction allows one rewrite and a final recheck. Up to five model calls with both options enabled. Reports source support with exact evidence excerpts.',inputSchema:z.object({answer:z.string().min(1).max(24000),sources:z.array(z.object({collectionId:z.number().int().negative(),fileId:z.number().int().positive(),id:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(8),correctConflicts:z.boolean().default(false),followUpSearches:KnowledgeFollowUpLimitSchema.default(0)}).strict(),execute:async input=>{
  if(!grant.permissions.knowledge||!grant.permissions.models||!grant.application||grant.application.mode==='router')throw Error('Knowledge verification is outside the endpoint permissions')
  const allowed=grant.application.knowledgeCollectionIds||[];if(input.sources.some(source=>!allowed.includes(source.collectionId)))throw Error('This collection is outside the endpoint knowledge permissions')
  await live();signal.throwIfAborted();const global=settingsStore.getState().getSettings();if(!global.defaultKnowledgeVerifierModel)throw Error('Choose a knowledge verifier model first');const model=KnowledgeModelSchema.parse(global.defaultKnowledgeVerifierModel),binding=JSON.stringify(global.providers?.[model.provider]),ids=[...new Set(input.sources.map(source=>source.collectionId))],security=localMCPModelSettings(grant.application,{provider:model.provider,modelId:model.model},global.providers).veniceSecurity
  const bindings:ReviewSourceBinding[]=[]
  const check=async()=>{signal.throwIfAborted();await live();for(const id of ids)await knowledgeCollections.assert(id);for(const binding of bindings)if(await knowledgeCollections.sourceRevision(binding.collectionId,binding.path)!==binding.sourceHash)throw Error('Knowledge source changed during verification');if(JSON.stringify(settingsStore.getState().getSettings().providers?.[model.provider])!==binding)throw Error('Knowledge model settings changed; retry explicitly')}
  for(const id of ids){await live();signal.throwIfAborted();await knowledgeCollections.authorize(id)}
  const sources:KnowledgeCheckSource[]=[]
  for(const reference of input.sources){
   await check()
   const {source,binding:revision}=await readReviewSource(reference,8000)
   sources.push(source);bindings.push(revision)
  }
  if(new Set(sources.map(source=>source.id)).size!==sources.length)throw Error('Do not repeat a knowledge source receipt')
  const followUpSearches=input.followUpSearches??0
  const calls=(input.correctConflicts?3:1)+followUpSearches
  if(!grant.permissions.automaticModels){const {requestExternalModelApproval}=await import('./model-approval');if(!await requestExternalModelApproval(grant,{provider:model.provider,modelId:model.model,maxOutputTokens:calls*4096,messages:[{role:'system',content:'Source-support review: at most '+calls+' model calls, 4096 output tokens each. The source excerpts and draft below will be sent to the verifier. Any additional source excerpts require approval.'},{role:'user',content:JSON.stringify({answer:input.answer,sources})}]},signal))throw Error('External model call was not approved')}
  const retrieve=followUpSearches?createReviewRetriever(ids,check,bindings,mcpReviewSourceApproval(grant,model,signal)):undefined
  await check()
  const result=await checkKnowledgeAnswer(input.answer,sources,{enabled:true,consented:true,model,correctConflicts:input.correctConflicts,...(followUpSearches?{followUpSearches}:{})},signal,check,security,undefined,retrieve)
  await check()
  return result
 }})
}
