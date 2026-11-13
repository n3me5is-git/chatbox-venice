import {validateKnowledgeRanking} from '@shared/knowledge-json'
import {knowledgeJson} from './llm'
export async function rerankWithLLM(query:string,documents:string[],provider:string,model:string,signal:AbortSignal){
 if(!query.trim()||query.length>8000||!documents.length||documents.length>20||documents.some(text=>text.length>2000))throw Error('LLM reranking exceeds the candidate limit')
 const value=await knowledgeJson({provider,model},'Rank these candidate passages for relevance to the query. Do not rewrite passages. Return {"ranking":[{"index":0,"score":0.9}]}, best first. Use only supplied zero-based indices, each at most once, and scores between 0 and 1. Include all candidates; ties preserve original order.',{query,passages:documents.map((text,index)=>({index,text}))},signal)
 const ranked=validateKnowledgeRanking(value,documents.length),seen=new Set(ranked.map(item=>item.index))
 // An omitted candidate retains its retrieval rank, below explicitly ranked candidates.
 return [...ranked,...documents.flatMap((_text,index)=>seen.has(index)?[]:[{index,score:0}])]
}
