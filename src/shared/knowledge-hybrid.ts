import {RAG_ROOT,RagIndexSchema,RagChunkSchema,normalizedVector,cosine,ragCitation,type RagChunk,type RagSettings} from './session-rag'
import {ragHash,type RagEnginePort} from './session-rag-engine'
import {fuseKnowledgeRanks} from './knowledge-augmentation'
export function retrievalTokens(text:string):string[]{return text.normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}_-]{2,64}/gu)||[]}
export function bm25Score(tf:readonly number[],df:readonly number[],documents:number,length:number,average:number){let score=0;for(let n=0;n<tf.length;n++)if(tf[n])score+=Math.log(1+(documents-df[n]+0.5)/(df[n]+0.5))*tf[n]*2.2/(tf[n]+1.2*(0.25+0.75*length/Math.max(1,average)));return score}
type Candidate=Omit<RagChunk,'vector'>&{score:number;shard:string;chunkIndex:number;tf?:number[];length?:number}
/** Exact query-term BM25 statistics collected during the existing vector scan.
 * Vectors stay in one shard; only matching lexical candidates and small top-K
 * semantic records survive the scan. No second plaintext lexical database. */
export async function hybridRagSearch(port:RagEnginePort,query:string,settings:RagSettings,signal:AbortSignal,limit=20,lexicalOnly=false){
 if(!query.trim()||query.length>8000)throw Error('Enter a knowledge search query up to 8000 characters')
 const {ragFingerprint}=await import('./session-rag-engine');await port.check();const index=RagIndexSchema.parse(await port.get(RAG_ROOT+'index.json'));if(index.fingerprint!==ragFingerprint(settings))throw Error('Build the RAG index for the selected model first');if(port.embeddingSpace&&index.embeddingSpace!==port.embeddingSpace)throw Error('The embedding endpoint or index binding changed. Use Reindex to rebuild vectors; no provider calls were made.')
 const terms=[...new Set(retrievalTokens(query))].slice(0,16),df=terms.map(()=>0),semantic:Candidate[]=[],lexical:Candidate[]=[];let count=0,totalLength=0
 const vectors=lexicalOnly?undefined:await port.embed([{text:query}],true,settings,signal),vector=vectors?normalizedVector(vectors[0]):undefined,overfetch=Math.min(96,Math.max(32,limit*3))
 for(const file of index.files)for(const shard of file.shards){signal.throwIfAborted();await port.check();const raw=await port.get(shard);if(!Array.isArray(raw)||raw.length>32)throw Error('Invalid RAG index')
  const shardOffset=file.shards.indexOf(shard)*32
  for(const [ordinal,value]of raw.entries()){const chunk=RagChunkSchema.parse(value);if(chunk.path!==file.path||chunk.sourceHash!==file.hash)throw Error('Invalid RAG index')
   const {vector:embedding,...fields}=chunk,source={...fields,chunkIndex:shardOffset+ordinal}
   if(vector){semantic.push({...source,score:cosine(vector,normalizedVector(embedding)),shard});semantic.sort((a,b)=>b.score-a.score);if(semantic.length>overfetch)semantic.length=overfetch}
   if(!chunk.text)continue
   const tokens=retrievalTokens(chunk.text),frequencies=new Map<string,number>();for(const token of tokens)frequencies.set(token,(frequencies.get(token)||0)+1)
   count++;totalLength+=tokens.length;const tf=terms.map((term,n)=>{const frequency=frequencies.get(term)||0;if(frequency)df[n]++;return frequency})
   if(tf.some(Boolean))lexical.push({...source,text:'',score:0,shard,tf,length:tokens.length})
  }
 }
 for(const item of lexical)item.score=bm25Score(item.tf!,df,count,item.length!,totalLength/Math.max(1,count))
 lexical.sort((a,b)=>b.score-a.score);lexical.length=Math.min(lexical.length,overfetch)
 const byId=new Map([...lexical,...semantic].map(item=>[item.id,item])),lanes=lexicalOnly?[lexical]:[lexical,semantic],fused=fuseKnowledgeRanks(lanes,overfetch),hashes=new Map<string,string|null>(),seen=new Set<string>(),matches=[]
 for(const item of fused){signal.throwIfAborted();await port.check();const candidate=byId.get(item.id)!
  if(!hashes.has(candidate.path)){try{if(port.revision)hashes.set(candidate.path,await port.revision(candidate.path));else{const bytes=await port.read(candidate.path);try{hashes.set(candidate.path,await ragHash(bytes))}finally{bytes.fill(0)}}}catch{hashes.set(candidate.path,null)}}
  if(hashes.get(candidate.path)!==candidate.sourceHash)continue
  let text=candidate.text;if(!text){const rows=await port.get(candidate.shard);if(!Array.isArray(rows))throw Error('Invalid RAG index');const parsed=rows.map(row=>RagChunkSchema.parse(row)).find(row=>row.id===candidate.id&&row.sourceHash===candidate.sourceHash);if(!parsed)throw Error('Knowledge passage changed; retry the search');text=parsed.text}
  const duplicate=candidate.path+'\0'+text.replace(/\s+/g,' ').trim();if(text&&seen.has(duplicate))continue;seen.add(duplicate)
  matches.push({id:candidate.id,chunkIndex:candidate.chunkIndex,path:candidate.path,line:candidate.line,endLine:candidate.endLine,page:candidate.page,score:item.rankScore,snippet:text.slice(0,350),modality:candidate.modality,url:ragCitation(candidate.path)});if(matches.length>=Math.min(32,Math.max(1,limit)))break
 }
 signal.throwIfAborted();await port.check();return {matches,indexedAt:index.updated,stale:[...hashes].some(([path,hash])=>index.files.find(file=>file.path===path)?.hash!==hash),ranking:lexicalOnly?'bm25':'vector-bm25-rrf'}
}
