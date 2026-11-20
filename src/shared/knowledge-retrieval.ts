/** Recovery is restricted to read-only retrieval. Never use this for generations. */
export function knowledgeStatusCode(error:unknown):number|undefined {
 const value=error as {statusCode?:unknown;status?:unknown;message?:unknown}|null
 const status=value?.statusCode??value?.status
 if(typeof status==='number')return status
 const match=typeof value?.message==='string'?/\b(?:Status Code|HTTP)\s+(\d{3})\b/i.exec(value.message):null
 return match?Number(match[1]):undefined
}
export function temporaryKnowledgeFailure(error:unknown){
 const code=knowledgeStatusCode(error),value=error as {code?:unknown;message?:unknown}|null
 return code!==undefined?[408,429,500,502,503,504].includes(code):value?.code===10002||value?.message==='Knowledge model request timed out'
}
export type KnowledgeSearchWarning={stage:'embedding'|'reranking';provider:string;model:string;statusCode?:number;message:string}
export function knowledgeSearchWarning(stage:KnowledgeSearchWarning['stage'],provider:string,model:string,error:unknown):KnowledgeSearchWarning{
 return {stage,provider,model,statusCode:knowledgeStatusCode(error),message:stage==='embedding'?'The embedding provider is temporarily unavailable. Search continued using local keyword matching; semantic matches may be missing.':'The reranker is temporarily unavailable. The original search results were retained without reranking.'}
}
export function knowledgeRetrievalError(stage:'embedding'|'reranking',provider:string,model:string,error:unknown){
 const status=knowledgeStatusCode(error)
 // Deliberately omit response bodies, source text, query text and credentials.
 return new Error(`${stage==='embedding'?'Query embedding':'Reranking'} failed (${provider} / ${model}${status?`; HTTP ${status}`:''}). Check this model's configuration or retry the search.`)
}
export async function retryKnowledgeEmbedding<T>(work:()=>Promise<T>,signal:AbortSignal,check:()=>Promise<void>){
 for(let attempt=0;;attempt++){
  signal.throwIfAborted();await check()
  try{const value=await work();signal.throwIfAborted();await check();return value}
  catch(error){
   signal.throwIfAborted();await check()
   // Rate limits stop immediately. Indexing and LLM reranking never enter here.
   if(attempt||!temporaryKnowledgeFailure(error)||knowledgeStatusCode(error)===429)throw error
   const raw=(error as {retryAfter?:string})?.retryAfter,seconds=raw?Number(raw):NaN
   const ms=raw?(Number.isFinite(seconds)?seconds*1000:Date.parse(raw)-Date.now()):750
   if(!Number.isFinite(ms)||ms>3000)throw error
   await new Promise<void>((resolve,reject)=>{const finish=()=>{signal.removeEventListener('abort',abort);resolve()},timer=setTimeout(finish,Math.max(0,ms)),abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason)};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()})
  }
 }
}
