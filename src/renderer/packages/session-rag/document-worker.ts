import {KNOWLEDGE_BASE_MAX_FILE_SIZE} from '@shared/knowledge-base'
import {parseLocalDocument} from '@shared/mobile-work/worker/document-parser'
/** Dedicated read-only parser: no generated code, workspace or execution API. */
self.onmessage=async(event:MessageEvent<{name:string;bytes:Uint8Array}>)=>{
 try{if(typeof event.data.name!=='string'||event.data.name.length>240||!(event.data.bytes instanceof Uint8Array))throw Error('Invalid knowledge document');const parsed=await parseLocalDocument(event.data.name,event.data.bytes,KNOWLEDGE_BASE_MAX_FILE_SIZE);self.postMessage({parsed})}
 catch(error){self.postMessage({error:(error as Error).message})}
 finally{if(event.data.bytes instanceof Uint8Array)event.data.bytes.fill(0)}
}
