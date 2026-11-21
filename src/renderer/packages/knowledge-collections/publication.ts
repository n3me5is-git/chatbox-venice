import {reviewActivity} from './review-activity'
import {createKnowledgePublication,knowledgeAnswerText} from '@shared/knowledge-publication'
import {knowledgeToolLedger} from '@shared/knowledge-ledger'
import {KnowledgeVerificationSettingsSchema,type KnowledgeCheckSource} from '@shared/knowledge-verification'
import type {MessageContentParts,SessionSettings} from '@shared/types'
import {settingsStore} from '@/stores/settingsStore'
import {uiStore} from '@/stores/uiStore'
import {rendererApplication} from '@/app/renderer-application'
import {currentBlobStorage} from '@/adapters/CurrentBlobStorage'
import {knowledgeCollections} from './service'
import {checkKnowledgeAnswer} from './verify'
import {createReviewRetriever,readReviewSource,type ReviewSourceApproval,type ReviewSourceBinding} from './review-sources'

/** Each run snapshots its declared verifier and selected collections. It never
 * promotes draft URLs or arbitrary MCP/file output into trusted evidence. */
export interface KnowledgeReviewBoundary {check():Promise<void>;mentionedCollectionIds?:readonly number[];collectionIds?:readonly number[];security?:SessionSettings['veniceSecurity'];approve?(model:NonNullable<SessionSettings['knowledgeVerification']>['model'],answer:string,sources:readonly KnowledgeCheckSource[],correct:boolean,followUpSearches?:number):Promise<void>;approveFollowUp?:ReviewSourceApproval}
export async function createChatKnowledgePublication(sessionId:string,settings:SessionSettings,signal:AbortSignal,boundary?:KnowledgeReviewBoundary){
 if(!settings.knowledgeVerification?.enabled)return undefined
 const cfg=KnowledgeVerificationSettingsSchema.parse(settings.knowledgeVerification)
 if(!cfg.consented||!cfg.model)throw Error('Choose and approve a knowledge verifier first')
 const binding=JSON.stringify(settingsStore.getState().getSettings().providers?.[cfg.model.provider]),primary=uiStore.getState().sessionKnowledgeBaseMap[sessionId]?.id,allowed=new Set([primary,...settings.knowledgeCollectionIds||[],...boundary?.mentionedCollectionIds||[]].filter((id):id is number=>typeof id==='number'&&id<0)),policy=JSON.stringify(settings.knowledgeVerification)
 const check=async()=>{signal.throwIfAborted();await boundary?.check();const header=(await rendererApplication.sessions.getSessionHeader(sessionId))?.header;if(!header)throw Error('This chat is unavailable');if(JSON.stringify(header.settings?.knowledgeVerification)!==policy)throw Error('Knowledge verification settings changed; retry explicitly');if(JSON.stringify(settingsStore.getState().getSettings().providers?.[cfg.model!.provider])!==binding)throw Error('Knowledge model settings changed; retry explicitly');if(uiStore.getState().sessionKnowledgeBaseMap[sessionId]?.id!==primary||JSON.stringify(header.settings?.knowledgeCollectionIds)!==JSON.stringify(settings.knowledgeCollectionIds))throw Error('Knowledge collections changed; retry explicitly')}
 await check()
 return createKnowledgePublication(async(parts:MessageContentParts)=>{
  await check();const ledger=await knowledgeToolLedger(parts,async key=>{await check();const value=await currentBlobStorage.get(key);await check();return value}),sources:KnowledgeCheckSource[]=[],revisions:ReviewSourceBinding[]=[]
  const perSource=Math.min(8000,Math.floor(64000/Math.max(1,ledger.references.length+ledger.external.length)))
  for(const ref of ledger.references){
   if(!allowed.has(ref.collectionId)||boundary?.collectionIds&&!boundary.collectionIds.includes(ref.collectionId))throw Error('This collection is no longer attached to the chat')
   const {source,binding}=await readReviewSource(ref,perSource)
   sources.push(source);revisions.push(binding)
  }
  sources.push(...ledger.external.map(source=>({...source,content:source.content.slice(0,perSource),truncated:source.truncated||source.content.length>perSource})))
  const live=async()=>{await check();for(const revision of revisions){await knowledgeCollections.assert(revision.collectionId);if(await knowledgeCollections.sourceRevision(revision.collectionId,revision.path)!==revision.sourceHash)throw Error('Knowledge source changed during verification')}}
  const retrieve=cfg.followUpSearches?createReviewRetriever(revisions.map(row=>row.collectionId),live,revisions,boundary?.approveFollowUp):undefined
  await live()
  const draft=knowledgeAnswerText(parts,'final-answer-v1')
  if(sources.length&&draft.length<=24000&&sources.reduce((sum,source)=>sum+source.content.length,0)<=64000)await boundary?.approve?.(cfg.model,draft,sources,cfg.correctConflicts,retrieve?cfg.followUpSearches:0)
  await live()
  let result
  try {
   reviewActivity.set(sessionId,'checking')
   result=await checkKnowledgeAnswer(draft,sources,cfg,signal,live,boundary?.security||settings.veniceSecurity,(phase,text)=>reviewActivity.set(sessionId,phase,text),retrieve)
  } finally {reviewActivity.clear(sessionId)}
  await live()
  if(ledger.truncated&&result.report.status==='checked'){result.report.status='incomplete';result.report.reason='partial_coverage'}
  return result
 },'final-answer-v1')
}
