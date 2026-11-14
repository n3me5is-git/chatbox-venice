import { Capacitor, registerPlugin } from '@capacitor/core'
import { mountKey, parseMountKey, type FolderRequest, type FolderReply } from '@shared/linked-folder'
import { resourceMime, resourceName, type SessionFile, type SessionResourceIndex } from '@shared/session-resources'
import platform from '@/platform'
const plugin=registerPlugin<{operation(input:FolderRequest):Promise<FolderReply>;pick(input:FolderRequest):Promise<FolderReply>}>('SessionFolder')
export const linkedFolderAvailable=()=>platform.type==='desktop'&&typeof window!=='undefined'&&!!window.electronAPI||platform.type==='mobile'&&Capacitor.getPlatform()==='android'
export async function linkedFolderOperation(input:FolderRequest):Promise<FolderReply>{
  if(!linkedFolderAvailable())return {linked:false}
  const {vaultRuntimeFor}=await import('@/packages/vault/runtime');if(input.sessionId.startsWith('knowledge-')){const value=input.sessionId.slice('knowledge-'.length),id=-Number(value);if(!/^[1-9][0-9]*$/.test(value)||!Number.isSafeInteger(id))throw Error('Invalid knowledge collection');await (await import('@/packages/knowledge-collections/service')).knowledgeCollections.assert(id)}else await vaultRuntimeFor(platform).projects.assertSession(input.sessionId)
  const result:FolderReply=platform.type==='desktop'?await window.electronAPI.invoke('session-folder:operation',input):input.action==='pick'?await plugin.pick(input):await plugin.operation(input)
  if(input.action!=='status'&&input.action!=='list'&&input.action!=='read'){const old=cache.get(input.sessionId);if(old)old.until=0;window.dispatchEvent(new CustomEvent('session-resources:changed',{detail:input.sessionId}))}
  return result
}
const managedPath=(path:string)=>path.startsWith('.chatbox/rag/')||path.startsWith('.chatbox/deliverables/')
const cache=new Map<string,{until:number;reply:FolderReply}>()
export async function mountedIndex(id:string,index:SessionResourceIndex):Promise<SessionResourceIndex>{
  const status=await linkedFolderOperation({sessionId:id,action:'status'});if(!status.linked)return index
  const cached=cache.get(id)
  let reply=cached&&cached.until>Date.now()&&cached.reply.bindingId===status.bindingId?cached.reply:undefined
  if(!reply){reply=await linkedFolderOperation({sessionId:id,action:'list',bindingId:status.bindingId});if(reply.truncated)throw Error('Linked folder exceeds the file tree limit');cache.set(id,{until:Date.now()+1000,reply})}
  const files:SessionFile[]=(reply.files||[]).map(file=>({id:'linked-file:'+file.path,path:file.path,name:resourceName(file.path),mime:resourceMime(file.path),bytes:file.bytes,updatedAt:file.modified,key:mountKey(id,file.path,status.bindingId+'~'+file.version),origin:'file'}))
  return {...index,removed:index.removed.filter(value=>!value.startsWith('linked-file:')&&!value.startsWith('key:linked:')),files:[...files,...index.files.filter(file=>managedPath(file.path))],directories:[...(reply.directories||[]),...(index.directories||[]).filter(path=>path.startsWith('.chatbox/rag'))]}
}
export async function mountedMetadata(id:string,next:SessionResourceIndex,previous:SessionResourceIndex){
  if(!(await linkedFolderOperation({sessionId:id,action:'status'})).linked)return next
  if(next.files.some(file=>!file.key.startsWith('linked:')&&!managedPath(file.path)&&!previous.files.some(old=>old.key===file.key)))throw Error('Use app storage before restoring a backup into a linked workspace')
  const known=new Set(cache.get(id)?.reply.directories||[])
  for(const path of next.directories||[])if(!path.startsWith('.chatbox')&&!known.has(path)){await linkedFolderOperation({sessionId:id,action:'mkdir',path});known.add(path)}
  return {...next,files:[...previous.files.filter(file=>!managedPath(file.path)),...next.files.filter(file=>managedPath(file.path))],directories:[...(previous.directories||[]),...(next.directories||[]).filter(path=>path.startsWith('.chatbox/rag'))]}
}
export async function readMounted(key:string){const item=parseMountKey(key);if(!item)return null;const reply=await linkedFolderOperation({...item,action:'read',expectedVersion:item.version});if(!reply.linked||reply.base64===undefined)throw Error('Linked folder changed');return Uint8Array.from(atob(reply.base64),c=>c.charCodeAt(0))}
export async function putMounted(id:string,bytes:Uint8Array,file:SessionFile,previous?:string|null){
  if(managedPath(file.path))return null
  const status=await linkedFolderOperation({sessionId:id,action:'status'});if(!status.linked)return null
  const old=previous?parseMountKey(previous):null;if(previous&&!old)throw Error('Linked folder changed')
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte)
  const reply=await linkedFolderOperation({sessionId:id,action:'write',bindingId:old?.bindingId||status.bindingId,path:file.path,base64:btoa(binary),expectedVersion:old?.version??null})
  if(!reply.linked||!reply.version)throw Error('Linked folder changed')
  return {id:'linked-file:'+file.path,key:mountKey(id,file.path,reply.bindingId+'~'+reply.version)}
}
export async function removeMounted(key:string){const item=parseMountKey(key);if(!item)return false;const reply=await linkedFolderOperation({...item,action:'remove',expectedVersion:item.version});if(!reply.linked)throw Error('Linked folder changed');return true}
