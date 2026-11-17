import {knowledgeJudgePayload,resolveKnowledgeClaimUnits,knowledgeUnitJudgeInstruction} from '@shared/knowledge-claim-units'
import {knowledgeRevisionInstruction,verifyKnowledgeAnswer,type KnowledgeCheckSource,type KnowledgeVerificationSettings} from '@shared/knowledge-verification'
import type {SessionSettings} from '@shared/types'
import {knowledgeJson} from './llm'
/** Shared provider adapter for app chat and desktop MCP. No tools or web search in the judge. */
export async function checkKnowledgeAnswer(answer:string,sources:readonly KnowledgeCheckSource[],settings:KnowledgeVerificationSettings,signal:AbortSignal,check:()=>Promise<void>,security?:SessionSettings['veniceSecurity'],observe?:(phase:'checking'|'correcting',text:string)=>void){
 if(!settings.model)throw Error('Choose a knowledge verifier model first')
 const model=settings.model
 const traces:{phase:'checking'|'correcting';text:string}[]=[];const track=(phase:'checking'|'correcting')=>{observe?.(phase,'');const row={phase,text:''};traces.push(row);return(text:string)=>{if(text){row.text=text.slice(-16000);observe?.(phase,row.text)}}}
 const result=await verifyKnowledgeAnswer(answer,sources,settings,{check,judge:async(text,sources,sig)=>resolveKnowledgeClaimUnits(text,sources,await knowledgeJson(model,knowledgeUnitJudgeInstruction,knowledgeJudgePayload(text,sources),sig,security,settings.reasoning,undefined,track('checking'))),revise:(text,claims,sources,sig)=>knowledgeJson(model,knowledgeRevisionInstruction,{answer:text,assessment:claims,sources},sig,security,settings.reasoning,undefined,track('correcting'))},signal)
 if(traces.some(row=>row.text))result.report.reasoning=traces.filter(row=>row.text).slice(0,3);return result
}
