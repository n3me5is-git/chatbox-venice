import {knowledgeJudgeInstruction,knowledgeRevisionInstruction,verifyKnowledgeAnswer,type KnowledgeCheckSource,type KnowledgeVerificationSettings} from '@shared/knowledge-verification'
import type {SessionSettings} from '@shared/types'
import {knowledgeJson} from './llm'
/** Shared provider adapter for app chat and desktop MCP. No tools or web search in the judge. */
export async function checkKnowledgeAnswer(answer:string,sources:readonly KnowledgeCheckSource[],settings:KnowledgeVerificationSettings,signal:AbortSignal,check:()=>Promise<void>,security?:SessionSettings['veniceSecurity']){
 if(!settings.model)throw Error('Choose a knowledge verifier model first')
 const model=settings.model
 return verifyKnowledgeAnswer(answer,sources,settings,{check,judge:(text,sources,sig)=>knowledgeJson(model,knowledgeJudgeInstruction,{answer:text,sources},sig,security),revise:(text,claims,sources,sig)=>knowledgeJson(model,knowledgeRevisionInstruction,{answer:text,assessment:claims,sources},sig,security)},signal)
}
