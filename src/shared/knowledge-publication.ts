import type {Message,MessageContentParts} from './types'
import {SECURITY_INFO} from './response-security'
import {KNOWLEDGE_VERIFICATION_INFO,KnowledgeCheckReportSchema,knowledgeAnswerHash,type KnowledgeCheckReport} from './knowledge-verification'

export interface KnowledgePublicationPort {
 project(message:Message):Message
 finish(message:Message):Promise<Message>
}
// Narration before/between tool calls belongs to the work log, not the final
// answer. Asking a source to prove "I will search" creates false insufficiency.
// A trailing provider reasoning block is deliberately not an answer boundary.
export const knowledgeAnswerText=(parts:MessageContentParts=[],scope?:'final-answer-v1')=>(scope?parts.slice(parts.findLastIndex(part=>part.type==='tool-call')+1):parts).flatMap(part=>part.type==='text'&&!part.protocolOnly?[part.text]:[]).join('\n')
export function knowledgeReportedAnswerText(parts:MessageContentParts=[]){const part=parts.findLast(part=>part.type==='info'&&part.text===KNOWLEDGE_VERIFICATION_INFO),parsed=KnowledgeCheckReportSchema.safeParse(part?.type==='info'?part.values?.report:undefined);return knowledgeAnswerText(parts,parsed.success?parsed.data.answerScope:undefined)}
export function reviewedKnowledgeParts(parts:MessageContentParts,answer:string,report:KnowledgeCheckReport):MessageContentParts{
 const previous=parts.filter(part=>part.type!=='info'||part.text!==KNOWLEDGE_VERIFICATION_INFO)
 if(!report.revised)return [...previous,{type:'info',text:KNOWLEDGE_VERIFICATION_INFO,values:{report}}]
 const retained:MessageContentParts=[]
 const lastTool=report.answerScope?previous.findLastIndex(part=>part.type==='tool-call'):-1
 for(const [index,part] of previous.entries()){
  // Signed provider blocks remain available for protocol replay, but cannot be
  // displayed/exported as the corrected answer or attest to its new wording.
  if(part.type==='text'){if(index<lastTool)retained.push(part);else if(part.providerMetadata)retained.push({...part,protocolOnly:true});continue}
  if(part.type==='info'&&part.text===SECURITY_INFO)continue
  retained.push(part)
 }
 const stepIndex=Math.max(0,...previous.map(part=>'stepIndex'in part?part.stepIndex||0:0))+1
 return [...retained,{type:'text',text:answer,stepIndex},{type:'info',text:KNOWLEDGE_VERIFICATION_INFO,values:{report}}]
}

/** Per-generation publication gate. Internal stream state stays intact, while
 * every public checkpoint hides unreviewed text/reasoning and transport badges.
 * Tool cards and stored media keep working, including paused HITL operations. */
export function createKnowledgePublication(verify:(parts:MessageContentParts)=>Promise<{answer:string;report:KnowledgeCheckReport}>,scope?:'final-answer-v1'):KnowledgePublicationPort{
 const approved=new Map<string,MessageContentParts>()
 return {
  project(message){
   if(approved.get(message.id)===message.contentParts)return message
   return {...message,contentParts:message.contentParts.flatMap((part):MessageContentParts=>{if(part.type==='text'||part.type==='reasoning')return part.type==='reasoning'||part.providerMetadata?[{...part,protocolOnly:true as const}]:[];if(part.type==='info'&&(part.text===SECURITY_INFO||part.text===KNOWLEDGE_VERIFICATION_INFO))return [];return [part]})}
  },
  async finish(message){
   const draft=knowledgeAnswerText(message.contentParts,scope),result=await verify(message.contentParts),report=KnowledgeCheckReportSchema.parse({...result.report,...(scope?{answerScope:scope}:{})})
   if(report.answerHash!==await knowledgeAnswerHash(result.answer)||report.draftHash!==await knowledgeAnswerHash(draft)||report.revised!==(result.answer!==draft))throw Error('Knowledge review does not match the published answer')
   const contentParts=reviewedKnowledgeParts(message.contentParts,result.answer,report)
   approved.set(message.id,contentParts);return {...message,contentParts}
  }
 }
}
