import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {KNOWLEDGE_BASE_MAX_FILE_SIZE,KNOWLEDGE_SOURCE_CHUNK_BYTES,KNOWLEDGE_SOURCE_TOO_LARGE} from '@shared/knowledge-base'

/** Sources are encrypted as bounded chunks; adding a batch never buffers all
 * files or creates a full-size base64 representation. */
export function knowledgeFileSource(file:Blob,check:()=>Promise<void>){
 if(!file.size||file.size>KNOWLEDGE_BASE_MAX_FILE_SIZE)throw Error(KNOWLEDGE_SOURCE_TOO_LARGE)
 const hash=sha256.create();let consumed=0,complete=false
 const chunks=(async function*(){
  for(let offset=0;offset<file.size;offset+=KNOWLEDGE_SOURCE_CHUNK_BYTES){await check();if(typeof file.slice!=='function'&&file.size>KNOWLEDGE_SOURCE_CHUNK_BYTES)throw Error('This file source does not support bounded reads');const part=typeof file.slice==='function'?file.slice(offset,offset+KNOWLEDGE_SOURCE_CHUNK_BYTES):file;const bytes=new Uint8Array(await part.arrayBuffer());try{if(bytes.length!==Math.min(KNOWLEDGE_SOURCE_CHUNK_BYTES,file.size-offset))throw Error('Incomplete knowledge source');hash.update(bytes);consumed+=bytes.length;yield bytes}finally{bytes.fill(0)}}
  await check();complete=consumed===file.size
 })()
 return {chunks,digest:()=>{if(!complete)throw Error('Incomplete knowledge source');return bytesToHex(hash.digest())}}
}

/** Hash the existing view without duplicating a 50 MiB source. Yield between
 * groups of chunks so the UI can process cancellation and lock events. */
export async function knowledgeSourceHash(bytes:Uint8Array,signal?:AbortSignal){
 signal?.throwIfAborted()
 if(bytes.length>KNOWLEDGE_BASE_MAX_FILE_SIZE)throw Error(KNOWLEDGE_SOURCE_TOO_LARGE)
 const hash=sha256.create()
 for(let offset=0;offset<bytes.length;offset+=KNOWLEDGE_SOURCE_CHUNK_BYTES){signal?.throwIfAborted();hash.update(bytes.subarray(offset,offset+KNOWLEDGE_SOURCE_CHUNK_BYTES));if(offset&&offset%(4*KNOWLEDGE_SOURCE_CHUNK_BYTES)===0)await new Promise<void>(resolve=>setTimeout(resolve,0))}
 signal?.throwIfAborted()
 return bytesToHex(hash.digest())
}
