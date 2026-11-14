import type {MessageContentParts} from './types'
import {parseKnowledgeEvidenceUrl} from './knowledge-evidence'
import {ragHash} from './session-rag-engine'
import type {KnowledgeCheckSource} from './knowledge-verification'

export async function knowledgeToolLedger(parts:MessageContentParts,readBlob?:(key:string)=>Promise<string|null>){
 const references=new Map<string,NonNullable<ReturnType<typeof parseKnowledgeEvidenceUrl>>>(),external:KnowledgeCheckSource[]=[];let truncated=false
 for(const part of parts){
  if(part.type!=='tool-call'||part.state!=='result')continue
  const knowledge=/^knowledge_(?:base|sources)(?:_\d+)?$/.test(part.toolName),web=/^(?:web_search(?:_(?:brave|google|exa))?|parse_link)$/.test(part.toolName)
  if(!knowledge&&!web)continue
  let output=part.result
  if(part.resultStorageKey&&readBlob){const text=await readBlob(part.resultStorageKey);if(!text||text.length>256000){truncated=true;continue}try{output=JSON.parse(text)}catch{continue}}
  if(typeof output==='string'&&output.length<=256000){try{output=JSON.parse(output)}catch{continue}}
  let visited=0
  const walk=async(value:unknown,depth=0):Promise<void>=>{
   if(depth>8||++visited>2048){truncated=true;return}
   if(Array.isArray(value)){for(const item of value)await walk(item,depth+1);return}
   if(!value||typeof value!=='object')return
   const row=value as Record<string,unknown>
   if(knowledge&&typeof row.url==='string'){const ref=parseKnowledgeEvidenceUrl(row.url);if(ref){if(references.size<32)references.set(row.url,ref);else truncated=true}}
   if(web){const link=typeof row.link==='string'?row.link:row.url,content=typeof row.snippet==='string'?row.snippet:row.content
    if(typeof link==='string'&&typeof content==='string'&&content.trim()){try{const url=new URL(link);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hostname==='chatbox.invalid')return
     if(external.length>=32){truncated=true;return}const text=content.slice(0,4000),id='external_'+await ragHash(new TextEncoder().encode(url.href+'\0'+text));if(!external.some(source=>source.id===id))external.push({id,origin:'external',url:url.href,name:typeof row.title==='string'?row.title.slice(0,512):url.hostname,content:text,truncated:content.length>text.length||row.truncated===true})
    }catch{/* A malformed tool URL is not a source. */}}
   }
   for(const [key,child]of Object.entries(row))if(!['url','link','content','snippet','title','text'].includes(key))await walk(child,depth+1)
  }
  await walk(output)
 }
 const refs=[...references.values()];if(refs.length+external.length>32)truncated=true
 return {references:refs,external:external.slice(0,Math.max(0,32-refs.length)),truncated}
}
