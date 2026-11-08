import type { Message } from '@shared/types'
import { getWorkArtifacts } from '@shared/work-artifacts'
import { MAX_RESOURCE_PREVIEW_BYTES, isTextResource, resourceMime, resourceName, type SessionResource } from '@shared/session-resources'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { veniceMediaService } from '@/packages/venice/service'
import { CapacitorWorkspace } from '@/packages/mobile-work-mode/CapacitorWorkspace'
import { currentBlobStorage } from '@/adapters/CurrentBlobStorage'
import { getImageGenerationService } from '@/stores/imageGenerationActions'
import platform from '@/platform'
import { resourcesChanged, sessionFiles } from './files'

const workspace=new CapacitorWorkspace()
const assertSession=(id:string)=>vaultRuntimeFor(platform).projects.assertSession(id)
function base64Bytes(value:string){const data=value.replace(/^data:[^,]*,/,'');return Uint8Array.from(atob(data),c=>c.charCodeAt(0))}
function messageResources(message:Message,messageId:string):SessionResource[]{
  const output:SessionResource[]=[]
  for(const file of message.files??[]){
    const key=file.rawStorageKey||file.storageKey
    if(key){const name=file.rawStorageKey?file.name:file.name+'.txt';output.push({id:'attachment:'+file.id,path:'attachments/'+name,name,mime:file.rawStorageKey?resourceMime(name):'text/plain',origin:'attachment',key,messageId})}
  }
  let html=false
  for(const part of message.contentParts){
    if(part.type==='text'&&/```html\s*\n/i.test(part.text))html=true
    if(part.type==='image'&&part.storageKey)output.push({id:'blob:'+part.storageKey,path:'images/'+resourceName(part.storageKey)+'.png',name:'Image',mime:'image/png',origin:'attachment',key:part.storageKey,messageId})
    for(const file of getWorkArtifacts(part))output.push({id:'artifact:'+(file.storageKey||file.path),path:'deliverables/'+file.path.replace(/^artifacts\//,''),name:file.name,mime:file.mimeType,bytes:file.size??undefined,origin:'artifact',key:file.storageKey||file.path,messageId,deliverable:true})
  }
  if(html)output.push({id:'message:'+messageId,path:'chat/'+messageId+'.html',name:'Chat artifact.html',mime:'text/html',origin:'message',messageId,deliverable:true})
  return output
}
/** Bounded payload batches traverse all branch subtrees; no transcript is retained. */
async function scanMessages(id:string,signal?:AbortSignal){
  const store=platform.getSessionRowStore();await store.initialize()
  const found:SessionResource[]=[];let threadCursor:Parameters<typeof store.readThreadSummariesPage>[0]['cursor'];let scanned=0
  do{
    signal?.throwIfAborted()
    const threads=await store.readThreadSummariesPage({sessionId:id,limit:30,cursor:threadCursor});if(!threads)break
    for(const thread of threads.threads){
      if(!thread.rootMessageId)continue
      let cursor:Parameters<typeof store.readMessageRelationsPage>[0]['cursor']
      do{
        signal?.throwIfAborted()
        const page=await store.readMessageRelationsPage({sessionId:id,threadId:thread.threadId,selector:{kind:'subtree',rootMessageId:thread.rootMessageId},limit:30,expectedRevision:threads.revision,cursor})
        if(!page||page.status!=='ready')throw new Error('Conversation changed. Refresh the resource list.')
        const ids=page.rows.filter(row=>row.facts.hasFiles||row.facts.hasToolCall||row.facts.imageStorageKeys.length||row.facts.role==='assistant').map(row=>row.messageId)
        if(ids.length){const data=await store.readMessages({sessionId:id,messageIds:ids,expectedRevision:page.revision});for(const row of data?.messages??[])found.push(...messageResources(row.message,row.messageId))}
        scanned+=page.rows.length;cursor=page.nextCursor??undefined
        if(found.length>=2000||scanned>=10000)return {found,truncated:true}
      }while(cursor)
    }
    threadCursor=threads.nextCursor??undefined
  }while(threadCursor)
  return {found,truncated:false}
}
export async function listSessionResources(id:string,signal?:AbortSignal){
  await assertSession(id)
  const index=await sessionFiles.index(id),items:SessionResource[]=[...index.files]
  let truncated=false
  if(platform.type==='mobile')items.push(...await workspace.listEntries(id))
  else if(platform.sessionDiskFiles){const disk=await platform.sessionDiskFiles({sessionId:id,action:'list'});if(!disk.success)throw new Error(disk.error);items.push(...disk.files);truncated=!!disk.truncated}
  const messages=await scanMessages(id,signal);items.push(...messages.found);truncated ||= messages.truncated
  const images=platform.getImageGenerationStorage();await images.initialize();let cursor:number|null=0
  do{
    signal?.throwIfAborted();const page=await images.getPage(cursor,100)
    for(const record of page.items)if(record.source?.sessionId===id)for(const [n,key]of record.generatedImages.entries())items.push({id:'image:'+record.id+':'+key,path:'images/'+record.id+'/'+(n+1)+'.png',name:(n+1)+'.png',mime:'image/png',origin:'image',key,recordId:record.id,index:n,deliverable:true})
    cursor=page.nextCursor
  }while(cursor!==null&&items.length<4000)
  for(const record of await veniceMediaService.list())if(record.sessionId===id&&record.blobKey)items.push({id:'media:'+record.id,path:'media/'+record.kind+'/'+record.id+'.'+(record.mime?.split('/')[1]||'bin'),name:record.prompt.slice(0,70)||record.model,mime:record.mime||'application/octet-stream',origin:'media',key:record.blobKey,recordId:record.id,deliverable:true})
  const removed=new Set(index.removed),seen=new Set<string>()
  const priority={file:5,image:4,media:4,artifact:3,workspace:2,attachment:1,message:0}
  const unique=items.sort((a,b)=>priority[b.origin]-priority[a.origin]).filter(item=>{if(removed.has(item.id)||item.key&&removed.has('key:'+item.key))return false;const key=item.key&&item.origin!=='file'?item.key:item.id;if(seen.has(key))return false;seen.add(key);return true})
  await assertSession(id)
  return {items:unique,truncated,options:{toolsEnabled:index.toolsEnabled!==false,pythonEnabled:!!index.pythonEnabled}}
}
export async function readSessionResource(id:string,item:SessionResource){
  await assertSession(id)
  const removed=(await sessionFiles.index(id)).removed
  if(removed.includes(item.id)||item.key&&removed.includes('key:'+item.key))throw new Error('This session resource was deleted')
  if(item.origin==='file')return sessionFiles.read(id,item.path)
  if(isTextResource(item)&&item.bytes!==undefined&&item.bytes>MAX_RESOURCE_PREVIEW_BYTES)throw new Error('File is too large for text preview')
  if(item.origin==='workspace'||item.id.startsWith('disk:')){
    if(platform.type==='mobile')return {file:item,bytes:base64Bytes(await workspace.readBase64(id,item.key!))}
    const result=await platform.sessionDiskFiles!({sessionId:id,action:'read',path:item.key});if(!result.success||result.base64===undefined)throw new Error(result.error||'File not found')
    await assertSession(id);return {file:item,bytes:base64Bytes(result.base64)}
  }
  if(item.origin==='message'){
    const {rendererApplication}=await import('@/app/renderer-application')
    const {createArtifactCode,appendArtifactMarkdown,renderArtifactCode}=await import('@/components/artifact-code')
    const history=createArtifactCode()
    for await(const markdown of rendererApplication.sessions.iterateSessionArtifactMarkdown({sessionId:id,messageId:item.messageId!}))appendArtifactMarkdown(history,markdown)
    const row=await platform.getSessionRowStore().readMessages({sessionId:id,messageIds:[item.messageId!]})
    const source=row?.messages[0]?.message.contentParts.filter(part=>part.type==='text').map(part=>part.text).join('\n')||''
    await assertSession(id);return {file:item,bytes:new TextEncoder().encode(renderArtifactCode(history,source))}
  }
  if(item.origin==='artifact'&&item.key?.startsWith('artifacts/'))return {file:item,bytes:base64Bytes(await workspace.readBase64(id,item.key))}
  const vault=vaultRuntimeFor(platform),header=item.key?await vault.assets.header(item.key):null
  if(header){
    if(header.bytes>20*1024*1024)throw new Error('File is too large for preview')
    const bytes=new Uint8Array(header.bytes);let offset=0
    for await(const chunk of vault.assets.read(item.key!)){bytes.set(chunk,offset);offset+=chunk.length;chunk.fill(0)}
    await assertSession(id);return {file:item,bytes}
  }
  const value=item.key?await currentBlobStorage.get(item.key):null
  if(!value)throw new Error('Session file not found')
  if(value.length>28*1024*1024)throw new Error('File is too large for preview')
  await assertSession(id);return {file:item,bytes:value.startsWith('data:')?base64Bytes(value):new TextEncoder().encode(value)}
}
export async function removeSessionResource(id:string,item:SessionResource){
  await assertSession(id)
  if(item.origin==='image'&&item.recordId&&item.key){
    await getImageGenerationService().deleteOutput(item.recordId,item.key)
    const assets=vaultRuntimeFor(platform).assets,header=await assets.header(item.key)
    if(header)await assets.describe(item.key,{...await assets.info(header),hidden:true})
  }else if(item.origin==='media'&&item.recordId)await veniceMediaService.remove(item.recordId)
  else if(item.origin==='workspace'||item.id.startsWith('disk:')){
    if(platform.type==='mobile')await workspace.removeFile(id,item.key!)
    else{const result=await platform.sessionDiskFiles!({sessionId:id,action:'remove',path:item.key});if(!result.success)throw new Error(result.error)}
  }else if(item.origin==='artifact'&&item.key?.startsWith('artifacts/'))await workspace.removeFile(id,item.key)
  else if(item.origin==='artifact'&&item.key)await currentBlobStorage.remove(item.key)
  else if(item.origin==='attachment'&&item.key)await currentBlobStorage.remove(item.key)
  await sessionFiles.remove(id,item.id,item.key?['key:'+item.key]:[])
  resourcesChanged(id)
}
export async function saveSessionResource(id:string,item:SessionResource,text:string){
  await assertSession(id)
  if(item.origin==='file')await sessionFiles.write(id,item.path,new TextEncoder().encode(text),{mime:item.mime})
  else if(item.origin==='workspace'){
    if(platform.type==='mobile'){
      const {textToBase64}=await import('@shared/mobile-work/workspace-path')
      await workspace.commit(id,{[item.key!]:{base64:textToBase64(text)}},new AbortController().signal)
    }else{const result=await platform.sessionDiskFiles!({sessionId:id,action:'write',path:item.key,content:text});if(!result.success)throw new Error(result.error)}
  }else throw new Error('Copy this resource to a session file before editing')
  resourcesChanged(id)
}
export function subscribeSessionResources(id:string,change:()=>void,locked:()=>void){
  const listener=(event:Event)=>{if((event as CustomEvent).detail===id)change()}
  window.addEventListener('session-resources:changed',listener)
  const unsubscribe=vaultRuntimeFor(platform).keys.subscribe(locked)
  return()=>{window.removeEventListener('session-resources:changed',listener);unsubscribe()}
}
export async function exportSessionResource(id:string,item:SessionResource){
  await assertSession(id)
  const assets=vaultRuntimeFor(platform).assets,header=item.key?await assets.header(item.key):null
  if(header){
    const safeName=resourceName(item.name).replace(/[\\/:*?"<>|%\u0000-\u001f]/g,'_')||'export'
    await platform.exporter.exportStreamingFile(safeName,async function*(){
      for await(const chunk of assets.read(item.key!)){
        try{await assertSession(id);yield chunk}finally{chunk.fill(0)}
      }
    },item.mime,undefined,{requiresStreaming:header.bytes>20*1024*1024,estimatedBytes:header.bytes})
    return
  }
  const {bytes}=await readSessionResource(id,item)
  const {shareLocalWorkArtifact}=await import('@/packages/mobile-work-mode/artifacts')
  let text='';for(const byte of bytes)text+=String.fromCharCode(byte)
  await shareLocalWorkArtifact({path:'artifacts/'+resourceName(item.name),name:item.name,mimeType:item.mime,size:bytes.length},btoa(text))
}
