import {KNOWLEDGE_BASE_MAX_FILE_SIZE,KNOWLEDGE_SOURCE_TOO_LARGE} from '@shared/knowledge-base'
import type {ParsedLocalDocument} from '@shared/mobile-work/document-parser'
/** Transfer one binary copy to a disposable parser worker, avoiding large
 * base64 strings in the generated-code execution bridge. */
export async function parseRagDocument(name:string,bytes:Uint8Array,signal:AbortSignal):Promise<ParsedLocalDocument>{
 signal.throwIfAborted();if(bytes.length>KNOWLEDGE_BASE_MAX_FILE_SIZE)throw Error(KNOWLEDGE_SOURCE_TOO_LARGE)
 const worker=new Worker(new URL('./document-worker.ts',import.meta.url),{type:'module'})
 return new Promise((resolve,reject)=>{let timer:ReturnType<typeof setTimeout>;let finished=false;const finish=(error?:Error,parsed?:ParsedLocalDocument)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(parsed!)};const abort=()=>finish(new DOMException('Aborted','AbortError'));worker.onmessage=event=>{if(event.data.error){finish(Error(event.data.error));return}const parsed=event.data.parsed;if(!parsed||typeof parsed.text!=='string'||parsed.text.length>100000||typeof parsed.truncated!=='boolean'){finish(Error('Invalid parsed document output'));return}finish(undefined,parsed)};worker.onerror=()=>finish(Error('Local document parsing failed'));timer=setTimeout(()=>finish(Error('Local document parsing timed out')),30000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}const copy=Uint8Array.from(bytes);try{worker.postMessage({name,bytes:copy},[copy.buffer])}catch(error){copy.fill(0);finish(error instanceof Error?error:Error(String(error)))}})
}
