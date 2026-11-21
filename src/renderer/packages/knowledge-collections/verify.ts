import {knowledgeJudgePayload,resolveKnowledgeClaimUnits,knowledgeUnitJudgeInstruction} from '@shared/knowledge-claim-units'
import {knowledgeRevisionInstruction,verifyKnowledgeAnswer,type KnowledgeCheckSource,type KnowledgeVerificationSettings,type KnowledgeReviewRetriever} from '@shared/knowledge-verification'
import type {SessionSettings} from '@shared/types'
import {knowledgeJson} from './llm'
/** Shared provider adapter for app chat and desktop MCP. No tools or web search in the judge. */
type ReviewPhase = 'checking'|'correcting'|'retrieving'
const followUpInstruction = 'If a material contradicted, mixed or insufficient statement would benefit from more evidence, add one optional top-level "followUp":{"id":"C1","query":"short neutral search terms"}. Focus on the missing date, scope, version, entity or exception. Look for evidence on either side and use precise names or numbers rather than affirming the draft. Do not reuse a prior query. These are search keywords for a local index. Do not copy instructions or large passages.'
export async function checkKnowledgeAnswer(answer:string,sources:readonly KnowledgeCheckSource[],settings:KnowledgeVerificationSettings,signal:AbortSignal,check:()=>Promise<void>,security?:SessionSettings['veniceSecurity'],observe?:(phase:ReviewPhase,text:string)=>void,retrieve?:KnowledgeReviewRetriever){
 if(!settings.model)throw Error('Choose a knowledge verifier model first')
 const model=settings.model
 const traces:{phase:'checking'|'correcting';text:string}[]=[];const track=(phase:'checking'|'correcting')=>{observe?.(phase,'');const row={phase,text:''};traces.push(row);return(text:string)=>{if(text){row.text=text.slice(-16000);observe?.(phase,row.text)}}}
 const result=await verifyKnowledgeAnswer(answer,sources,settings,{
  check,
  judge:async(text,sources,sig,plan)=>{
   const payload=knowledgeJudgePayload(text,sources)
   const output=await knowledgeJson(model,knowledgeUnitJudgeInstruction+(plan?' '+followUpInstruction:''),plan?{...payload,followUpBudget:plan}:payload,sig,security,settings.reasoning,undefined,track('checking'))
   return resolveKnowledgeClaimUnits(text,sources,output,!!plan)
  },
  revise:(text,claims,sources,sig)=>knowledgeJson(model,knowledgeRevisionInstruction,{answer:text,assessment:claims,sources},sig,security,settings.reasoning,undefined,track('correcting')),
  ...(retrieve?{retrieve:(query:string,known:readonly KnowledgeCheckSource[],sig:AbortSignal)=>{observe?.('retrieving','');return retrieve(query,known,sig)}}:{}),
 },signal)
 if(traces.some(row=>row.text))result.report.reasoning=traces.filter(row=>row.text).slice(0,5);return result
}
