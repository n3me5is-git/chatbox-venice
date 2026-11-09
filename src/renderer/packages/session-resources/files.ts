import { SessionFileStore } from '@shared/session-file-store'
import { emptyResourceIndex, type SessionFile, type SessionResourceIndex } from '@shared/session-resources'
import { sessionDirectoryName } from '@shared/mobile-work/workspace-path'
import { vaultRuntimeFor, installedVaultFor } from '@/packages/vault/runtime'
import type { AssetInfo } from '@/packages/vault/chunk-store'
import platform from '@/platform'
import { mountedIndex, mountedMetadata, readMounted, putMounted, removeMounted } from './linked-folder'

const vault = () => vaultRuntimeFor(platform)
const indexKey = (id:string) => 'session-resource-index:' + sessionDirectoryName(id)
export function resourcesChanged(sessionId:string){window.dispatchEvent(new CustomEvent('session-resources:changed',{detail:sessionId}))}
async function access(id:string) { await vault().projects.assertSession(id) }
async function bytes(key:string,max=12*1024*1024){
  const mounted=await readMounted(key);if(mounted)return mounted
  const header=await vault().assets.header(key)
  if(!header||header.bytes>max)throw new Error('Session file is missing or too large')
  const output=new Uint8Array(header.bytes);let offset=0
  for await(const chunk of vault().assets.read(key)){output.set(chunk,offset);offset+=chunk.length;chunk.fill(0)}
  return output
}
async function scope(id:string){return (await vault().assets.header(indexKey(id)))?.scope||await vault().projects.sessionScope(id)||'public'}
async function put(id:string,key:string,data:Uint8Array,info:AssetInfo){
  await access(id)
  if(!await vault().available())throw new Error('Device encryption is unavailable')
  const previous=await vault().assets.header(key)
  await vault().assets.put((async function*(){yield data.length?data:new Uint8Array([0])})(),info,await scope(id),key)
  if(previous)await vault().assets.remove('vault-asset-'+previous.id)
}
const info=(id:string,file:SessionFile):AssetInfo=>({name:file.name,mime:file.mime,kind:file.mime.startsWith('image/')?'image':file.mime.startsWith('audio/')?'audio':file.mime.startsWith('video/')?'video':'document',sessionId:id,resourcePath:file.path,deliverable:file.deliverable,logicalBytes:file.bytes})
async function rawIndex(id:string){
  const key=indexKey(id)
  if(!await vault().assets.header(key))return emptyResourceIndex()
  const data=await bytes(key,2*1024*1024)
  try{return JSON.parse(new TextDecoder().decode(data)) as SessionResourceIndex}finally{data.fill(0)}
}
export const sessionFiles=new SessionFileStore({
  assertAccess:access,
  loadIndex:async(id,managed)=>{const raw=await rawIndex(id);return managed?raw:mountedIndex(id,raw)},
  saveIndex:async(id,index,managed)=>{const previous=await rawIndex(id),saved=managed?index:await mountedMetadata(id,index,previous);await put(id,indexKey(id),new TextEncoder().encode(JSON.stringify(saved)),{name:'Session resource index',mime:'application/json',kind:'chat',sessionId:id});const changed=[...previous.files.filter(file=>!saved.files.some(next=>next.key===file.key)),...saved.files.filter(file=>!previous.files.some(old=>old.key===file.key))];if(!changed.length||changed.some(file=>!file.path.startsWith('.chatbox/rag/data/')))resourcesChanged(id)},
  read:key=>bytes(key),
  put:async(id,key,data,file,options)=>await putMounted(id,data,file,options?.expectedVersion) || await put(id,key,data,info(id,file)),
  remove:async key=>{if(!await removeMounted(key))await vault().assets.remove(key)},
  discard:async key=>{if(!key.startsWith('linked:'))await vault().assets.remove(key)},
  describe:async(key,file)=>{
    if(key.startsWith('linked:'))return
    const header=await vault().assets.header(key);if(!header)throw new Error('Session file not found')
    const old=await vault().assets.info(header)
    await vault().assets.describe(key,{...old,name:file.name,resourcePath:file.path,deliverable:file.deliverable})
  },
})

/** Deletion runs before chat metadata disappears, while its project key is accessible. */
export async function cleanupSessionFiles(id:string){
  if(!installedVaultFor(platform))return
  await access(id)
  const key=indexKey(id)
  const rag=await import('@/packages/session-rag/service');rag.cancelSessionRag(id)
  await vault().db.setSetting('rag:consent:'+id,null)
  const watched=await vault().db.getSetting<string[]>('rag:auto-sessions')||[];await vault().db.setSetting('rag:auto-sessions',watched.filter(value=>value!==id))
  // Unlinking/deleting a chat never deletes its external directory.
  const {linkedFolderOperation}=await import('./linked-folder')
  await linkedFolderOperation({sessionId:id,action:'unlink'})
  if(!await vault().assets.header(key))return
  for(const file of (await rawIndex(id)).files)await vault().assets.remove(file.key)
  await vault().assets.remove(key)
  resourcesChanged(id)
}

/** Keep a session index consistent when a deliverable is deleted from the library. */
export async function removeManagedLibraryFile(key:string){
  const header=await vault().assets.header(key)
  if(!header)return false
  const info=await vault().assets.info(header)
  if(!info.sessionId||!info.resourcePath)return false
  const file=(await sessionFiles.list(info.sessionId)).find(file=>file.path===info.resourcePath&&file.key===(header.alias||key))
  if(file)await sessionFiles.remove(info.sessionId,file.id)
  else await vault().assets.remove(key)
  return true
}
