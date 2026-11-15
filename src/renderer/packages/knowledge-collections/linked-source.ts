import {sha256} from '@noble/hashes/sha256'
import {bytesToHex} from '@noble/hashes/utils'
import {KNOWLEDGE_BASE_MAX_FILE_SIZE,KNOWLEDGE_SOURCE_CHUNK_BYTES,KNOWLEDGE_SOURCE_TOO_LARGE} from '@shared/knowledge-base'
import type {FolderReply,FolderRequest} from '@shared/linked-folder'
/** Bridge responses are at most one MiB. Publication still verifies the final
 * source hash, so mixed revisions or changed grants cannot enter an index. */
export async function readLinkedKnowledgeSource(file:{path:string;bytes:number;version:string},bindingId:string,operation:(action:FolderRequest['action'],options:Partial<FolderRequest>)=>Promise<FolderReply>,signal:AbortSignal){
 if(!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>KNOWLEDGE_BASE_MAX_FILE_SIZE)throw Error(KNOWLEDGE_SOURCE_TOO_LARGE)
 const bytes=new Uint8Array(file.bytes),hash=sha256.create()
 try{for(let offset=0;offset<bytes.length;offset+=KNOWLEDGE_SOURCE_CHUNK_BYTES){signal.throwIfAborted();const length=Math.min(KNOWLEDGE_SOURCE_CHUNK_BYTES,bytes.length-offset),reply=await operation('read-chunk',{bindingId,path:file.path,offset,length});signal.throwIfAborted();if(!reply.linked||reply.bindingId!==bindingId||reply.offset!==offset||reply.totalBytes!==file.bytes||typeof reply.base64!=='string'||reply.base64.length>Math.ceil(length/3)*4)throw Error('Linked source changed during refresh');const chunk=Uint8Array.from(atob(reply.base64),char=>char.charCodeAt(0));try{if(chunk.length!==length)throw Error('Linked source changed during refresh');hash.update(chunk);bytes.set(chunk,offset)}finally{chunk.fill(0)}}if(bytesToHex(hash.digest())!==file.version)throw Error('Linked source changed during refresh');return bytes}catch(error){bytes.fill(0);throw error}
}
