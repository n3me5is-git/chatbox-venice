import type { SessionFileStore } from './session-file-store'
import { validateWorkspaceFiles, type WorkspaceFiles } from './mobile-work/workspace-path'
import type { ExecutionResult } from './mobile-work/MobileExecutionService'

export interface SessionExecutor {execute(code:string,files:WorkspaceFiles,signal:AbortSignal):Promise<ExecutionResult>}
function encode(bytes:Uint8Array){let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value)}
function decode(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0))}

/** Only explicitly selected session files enter the isolated runtime, never app stores/keys. */
export async function executeSessionCode(store:SessionFileStore,executor:SessionExecutor,id:string,code:string,paths:string[],signal:AbortSignal){
  if(code.length>100000||paths.length>128)throw new Error('Execution input exceeds the size limit')
  const index=await store.index(id)
  if(index.toolsEnabled===false)throw new Error('Session workspace tools are disabled')
  const baseline=Object.fromEntries(index.files.map(file=>[file.path,file.key])),files:WorkspaceFiles=Object.create(null)
  let total=0
  for(const path of new Set(paths)){
    signal.throwIfAborted()
    const {bytes}=await store.read(id,path)
    try{total+=bytes.length;if(total>20*1024*1024)throw new Error('Execution input exceeds the size limit');files[path]={base64:encode(bytes)}}finally{bytes.fill(0)}
  }
  validateWorkspaceFiles(files);const result=await executor.execute(code,files,signal)
  signal.throwIfAborted()
  const current=await store.index(id)
  if(current.toolsEnabled===false)throw new Error('Session workspace tools are disabled')
  if(result.error)return {stdout:result.stdout,error:result.error,files:[],exitCode:1}
  validateWorkspaceFiles(result.files)
  const changes=Object.fromEntries(Object.entries(result.files).map(([path,file])=>[path,decode(file.base64)]))
  try{if(Object.keys(changes).some(path=>path.startsWith('.chatbox/rag/')))throw Error('RAG index files are managed by the app');await store.commit(id,changes,baseline,signal)}finally{for(const bytes of Object.values(changes))bytes.fill(0)}
  return {stdout:result.stdout,files:Object.keys(changes),exitCode:0}
}
