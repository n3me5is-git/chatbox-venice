import {tool,type ToolSet} from 'ai'
import {z} from 'zod'
import type {SessionSettings} from '@shared/types'
import {knowledgeEvidenceUrl} from '@shared/knowledge-evidence'
import {KNOWLEDGE_VERIFICATION_INFO} from '@shared/knowledge-verification'
export async function getKnowledgeVerifierTools(sessionId:string,settings:SessionSettings):Promise<ToolSet>{
 if(!settings.knowledgeVerification?.enabled||!settings.knowledgeVerification.consented||!settings.knowledgeVerification.model)return {}
 return {knowledge_verify:tool({description:'Assess an explicitly requested intermediate draft against actual portable-collection citation receipts. The chat already reviews final answers automatically; do not call this redundantly before every final answer. Each invocation may incur up to3 additional calls to the user-approved verifier, with optional one correction. Pass exact receipt IDs returned by knowledge search/source tools, never guessed source text or model knowledge. This is source support, not proof of truth. Protected sources require owner unlock.',inputSchema:z.object({answer:z.string().min(1).max(24000),sources:z.array(z.object({collectionId:z.number().int().negative(),fileId:z.number().int().positive(),id:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(8)}).strict(),execute:async(input,options)=>{
  const signal=options.abortSignal||new AbortController().signal,{createChatKnowledgePublication}=await import('@/packages/knowledge-collections/publication'),gate=await createChatKnowledgePublication(sessionId,settings,signal);if(!gate)throw Error('Source review is disabled')
  const {uiStore}=await import('@/stores/uiStore'),selected=new Set([uiStore.getState().sessionKnowledgeBaseMap[sessionId]?.id,...settings.knowledgeCollectionIds||[]]),{knowledgeCollections}=await import('@/packages/knowledge-collections/service')
  for(const source of input.sources){if(!selected.has(source.collectionId))throw Error('This collection is no longer attached to the chat');signal.throwIfAborted();await knowledgeCollections.authorize(source.collectionId)}
  const refs=input.sources.map(source=>({url:knowledgeEvidenceUrl(source.collectionId,source.fileId,source.id)})),message=await gate.finish({id:crypto.randomUUID(),role:'assistant',contentParts:[{type:'text',text:input.answer},{type:'tool-call',state:'result',toolName:'knowledge_sources',toolCallId:'review-input',args:{},result:{references:refs}}]}),report=message.contentParts.find(part=>part.type==='info'&&part.text===KNOWLEDGE_VERIFICATION_INFO)
  return {answer:message.contentParts.flatMap(part=>part.type==='text'&&!part.protocolOnly?[part.text]:[]).join('\n'),report:report?.type==='info'?report.values?.report:undefined,references:refs}
 }})}
}
