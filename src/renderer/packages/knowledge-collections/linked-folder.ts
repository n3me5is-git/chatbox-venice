import type {FolderReply,FolderRequest} from '@shared/linked-folder'
import {ragExcluded} from '@shared/session-rag'
import {resourceMime} from '@shared/session-resources'
import {linkedFolderAvailable,linkedFolderOperation} from '@/packages/session-resources/linked-folder'
import {knowledgeCollections as store} from './service'
export const knowledgeFolderAvailable=linkedFolderAvailable
const identity=(id:number)=>{if(!Number.isSafeInteger(id)||id>=0)throw Error('Invalid knowledge collection');return 'knowledge-'+Math.abs(id)}
const issues=new Map<number,string>()
export const linkedCollectionError=(id:number)=>issues.get(id)
const changed=(id:number)=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('knowledge-collections:changed',{detail:id}))}
const operation=async(id:number,action:FolderRequest['action'],options:Partial<FolderRequest>={})=>{await store.assert(id);const reply=await linkedFolderOperation({...options,sessionId:identity(id),action});await store.assert(id);return reply}
export async function chooseCollectionFolder(id:number){const before=(await store.data(id)).folder,reply=await operation(id,'pick');if(reply.bindingId===before?.bindingId)return;if(reply.linked&&reply.bindingId)await store.linkFolder(id,{bindingId:reply.bindingId,name:reply.name||'Folder',automatic:false});changed(id)}
export async function disconnectCollectionFolder(id:number){await operation(id,'unlink');await store.linkFolder(id,undefined);issues.delete(id);changed(id)}
export async function automaticCollectionFolder(id:number,automatic:boolean){const data=await store.data(id);if(!data.folder)throw Error('No folder is linked');await store.linkFolder(id,{...data.folder,automatic});changed(id)}
/** Each scan is bounded and hashes actual bytes. Missing/revoked/incomplete roots
 * fail closed; they never become an empty deletion snapshot. No source writes. */
export async function refreshCollectionFolder(id:number,index=false,signal=new AbortController().signal){
 try{const data=await store.data(id),folder=data.folder;if(!folder)throw Error('No folder is linked')
  const check=async()=>{signal.throwIfAborted();const status=await operation(id,'status');if(!status.linked||status.bindingId!==folder.bindingId)throw Error('Linked folder is unavailable or changed');if((await store.data(id)).folder?.bindingId!==folder.bindingId)throw Error('Linked folder changed')}
  await check();const reply:FolderReply=await operation(id,'list',{bindingId:folder.bindingId});if(!reply.linked||reply.bindingId!==folder.bindingId||!Array.isArray(reply.files)||reply.truncated||reply.skipped?.length)throw Error('Linked folder scan is incomplete; previous documents were kept')
  const rows=(reply.files||[]).filter(row=>{if(!row.bytes||ragExcluded(row.path,data.settings))return false;const mime=resourceMime(row.path);return mime.startsWith('image/')?data.settings.images||data.settings.ocr:mime.startsWith('audio/')?data.settings.audio||data.settings.stt:/\.(pdf|docx?|xlsx|pptx|epub|odt|ods|odp|rtf|html?|md|markdown|txt|csv|tsv|json|ya?ml|xml|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|sh|ps1|sql|css|scss|toml|ini|log)$/i.test(row.path)})
  const result=await store.syncFolder(id,folder.bindingId,rows,{check,read:async(path,hash)=>{const reply=await operation(id,'read',{bindingId:folder.bindingId,path,expectedVersion:hash});if(!reply.linked||reply.bindingId!==folder.bindingId||reply.version!==hash||reply.base64===undefined)throw Error('Linked source changed during refresh');return Uint8Array.from(atob(reply.base64),char=>char.charCodeAt(0))}},signal)
  if(index){await check();await store.index(id,undefined,false)}issues.delete(id);changed(id);return result
 }catch(error){issues.set(id,error instanceof Error?error.message:String(error));changed(id);throw error}
}
let stop:undefined|(()=>void)
export function startKnowledgeFolderMonitoring(){
 if(stop)return stop;if(!knowledgeFolderAvailable())return()=>{};let running=false,closed=false,owned:number|undefined,controller:AbortController|undefined
 const pause=()=>{controller?.abort();if(owned!==undefined)store.cancel(owned)}
 const visibility=()=>{if(document.visibilityState==='hidden')pause()}
 const tick=async()=>{if(closed||running||document.visibilityState==='hidden')return;running=true;controller=new AbortController();try{for(const entry of await store.list()){if(closed||controller.signal.aborted)break;if(entry.locked||store.running(entry.id)||issues.has(entry.id))continue;try{const data=await store.data(entry.id);if(data.folder?.automatic&&data.consented){const result=await refreshCollectionFolder(entry.id,false,controller.signal);controller.signal.throwIfAborted();if(result.added+result.changed+result.removed){owned=entry.id;await store.index(entry.id);changed(entry.id)}}}catch(error){issues.set(entry.id,error instanceof Error?error.message:String(error));changed(entry.id)}finally{owned=undefined}}}catch{/* Application lock pauses discovery without inference. */}finally{controller=undefined;running=false}}
 const timer=setInterval(()=>void tick(),60000);document.addEventListener('visibilitychange',visibility);stop=()=>{closed=true;pause();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);stop=undefined};return stop
}
