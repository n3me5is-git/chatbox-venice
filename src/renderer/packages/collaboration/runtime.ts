import { openSessionChatExport } from '@chatbox/core/utils/chat-export'
import { createMessage,type Message } from '@shared/types'
import { sessionFilePath,type SessionFile,type SessionResource } from '@shared/session-resources'
import type { SharedSnapshot,SharedFile,SharedAuthor,HitlInput,HitlAnswer } from '@shared/collaboration'
import {canShareAsset} from '@shared/collaboration'
import { rendererApplication } from '@/app/renderer-application'
import { listSessionResources,readSessionResource,subscribeSessionResources } from '@/packages/session-resources/service'
import { resourcesChanged,sessionFiles } from '@/packages/session-resources/files'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { initEmptyChatSession } from '@/stores/sessionHelpers'
import { submitNewUserMessage } from '@/stores/session/messages'
import { deleteSession,switchCurrentSession } from '@/stores/session/crud'
import { CollaborationHub } from './hub'
import { b64 } from './crypto'
import { installCollaborationBridge,notifySharedChatStatus } from './bridge'
import { getImageGenerationService } from '@/stores/imageGenerationActions'
import { installSharingBackground, syncSharingBackground } from './background'

const vault=()=>vaultRuntimeFor(platform)
async function shareable(id:string,item:SessionResource){return canShareAsset(await vault().projects.sessionScope(id)||undefined,item.key?(await vault().assets.header(item.key))?.scope:undefined)}
async function publicId(item:SessionResource){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([item.id,item.key,item.updatedAt,item.bytes])))))}
function safePath(item:SessionResource){try{return sessionFilePath(item.path)}catch{return 'files/'+item.id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60)+'/'+item.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,80)}}
function text(message:Message){return message.contentParts.map(part=>part.type==='text'?part.text:part.type==='tool-call'?'\n['+part.toolName+']\n'+JSON.stringify({args:part.args,result:part.result}):'').join('\n')}
async function snapshot(id:string):Promise<SharedSnapshot>{
  await vault().projects.assertSession(id)
  const source=await openSessionChatExport(platform.getSessionRowStore(),rendererApplication.sessions,id);if(!source)throw Error('This chat is no longer available')
  const all=await listSessionResources(id),items:SessionResource[]=[];for(const item of all.items)if(await shareable(id,item))items.push(item)
  const resources={...all,items},files:SharedFile[]=[],resourceIds=new Map<string,string>(),imageCalls=new Map<string,string|undefined>(),callFiles=new Map<string,string[]>()
  for(const item of resources.items){const fileId=await publicId(item);files.push({id:fileId,path:safePath(item),name:item.name.slice(0,240),mime:item.mime,bytes:item.bytes,deliverable:item.deliverable});if(item.messageId){const list=resourceIds.get(item.messageId);resourceIds.set(item.messageId,list?list+'\n'+fileId:fileId)}}
  for(let index=0;index<resources.items.length;index++){const item=resources.items[index];if(item.origin!=='image'||!item.recordId)continue;if(!imageCalls.has(item.recordId)){const record=await getImageGenerationService().getRecord(item.recordId);imageCalls.set(item.recordId,record?.source?.sessionId===id?record.source.toolCallId:undefined)}const call=imageCalls.get(item.recordId);if(call)callFiles.set(call,[...callFiles.get(call)||[],files[index].id])}
  const messages:SharedSnapshot['messages']=[];let truncated=resources.truncated,characters=0
  threads:for await(const thread of source.threads(true)){
    if(thread.threadId!==source.activeThreadId)messages.push({id:'thread-'+thread.threadId,role:'system',text:'Archived thread: '+thread.name})
    for await(const row of source.allRows(thread)){
      if(messages.length>=10000||characters>6000000){truncated=true;break threads}
      const message=await source.message(row.messageId)
      if(!['user','assistant','system'].includes(message.role))continue
      const value=text(message);if(value.length>200000)truncated=true;characters+=Math.min(value.length,200000)
      const attached=[...resourceIds.get(message.id)?.split('\n')||[],...message.contentParts.flatMap(part=>part.type==='tool-call'?callFiles.get(part.toolCallId)||[]:[])]
      messages.push({id:thread.threadId+':'+message.id,role:message.role as 'user'|'assistant'|'system',text:value.slice(0,200000),...(message.collaborationAuthor?{author:message.collaborationAuthor}:message.role==='user'?{author:{id:'owner',name:'Owner'}}:{}),...(attached.length?{files:[...new Set(attached)]}: {})})
    }
  }
  await source.assertCurrent();await vault().projects.assertSession(id)
  return {title:source.header.name.slice(0,240),messages,files,truncated,revision:source.revision}
}
async function* file(id:string,fileId:string){
  await vault().projects.assertSession(id)
  let found:SessionResource|undefined
  for(const item of (await listSessionResources(id)).items)if(await publicId(item)===fileId){found=item;break}
  if(!found)throw Error('This file changed or was deleted. Refresh the shared chat.')
  if(!await shareable(id,found))throw Error('This creation is individually protected and cannot be shared with this chat')
  if(found.key&&await vault().assets.header(found.key)){
    for await(const bytes of vault().assets.read(found.key)){await vault().projects.assertSession(id);if(!await shareable(id,found)){bytes.fill(0);throw Error('This creation is individually protected and cannot be shared with this chat')}yield bytes}
  }else{const value=await readSessionResource(id,found);try{for(let offset=0;offset<value.bytes.length;offset+=32768){await vault().projects.assertSession(id);if(!await shareable(id,found))throw Error('This creation is individually protected and cannot be shared with this chat');yield value.bytes.slice(offset,offset+32768)}}finally{value.bytes.fill(0)}}
}
export const collaboration=new CollaborationHub({
  snapshot,
  async submit(id,text,interact,author,authorization){await vault().projects.assertSession(id);const message=createMessage('user',text);message.collaborationAuthor=author;let saved=false,active=false
    const abort=()=>{if(active)void import('@/stores/session/generation-cancellation').then(module=>module.stopAllMessageGenerations(id))}
    const authorize=()=>{authorization.signal.throwIfAborted();authorization.assert();active=true}
    authorization.signal.addEventListener('abort',abort,{once:true})
    try{await submitNewUserMessage(id,{newUserMsg:message,needGenerating:interact,onUserMessageReady:()=>{saved=true},authorize})}finally{active=false;authorization.signal.removeEventListener('abort',abort)}
    if(!saved)throw Error('The chat is busy or unavailable. No new message was accepted.')
  },
  file,
  async clone(snapshot,read,signal){
    if(!await vault().available())throw Error('Device encryption is unavailable')
    const total=snapshot.files.reduce((sum,file)=>sum+(file.bytes??0),0);if(total>512*1024*1024||snapshot.files.length>2048)throw Error('This workspace exceeds the local import limit')
    signal.throwIfAborted()
    const created=await rendererApplication.sessions.createSession({...initEmptyChatSession(),name:snapshot.title+' (copy)',messages:[]}),saved:string[]=[],incoming:SessionFile[]=[],mapping=new Map<string,SessionFile>(),paths=new Set<string>()
    try{
      for(const file of snapshot.files){
        signal.throwIfAborted();let path=sessionFilePath(file.path);if(paths.has(path))path=sessionFilePath('copies/'+file.id.slice(0,8)+'/'+path);paths.add(path)
        const alias='session-file:'+encodeURIComponent(created.id)+':'+crypto.randomUUID();let size=0
        const source=async function*(){for await(const chunk of read(file.id)){size+=chunk.length;if(size>128*1024*1024||size>10*1024*1024&&!/^(image|audio|video)\//.test(file.mime))throw Error('File exceeds the local import limit');yield chunk}if(file.bytes!==undefined&&size!==file.bytes)throw Error('Shared file size changed during import');if(!size)yield new Uint8Array([0])}
        const ref=await vault().assets.put(source(),{sessionId:created.id,resourcePath:path,name:file.name,mime:file.mime,kind:file.mime.startsWith('image/')?'image':file.mime.startsWith('audio/')?'audio':file.mime.startsWith('video/')?'video':'document',deliverable:file.deliverable},'public',alias,signal);saved.push(ref)
        if(!size){const header=await vault().assets.header(ref);if(header)await vault().assets.describe(ref,{...await vault().assets.info(header),logicalBytes:0})}
        const value:SessionFile={id:crypto.randomUUID(),origin:'file',key:alias,path,name:file.name,mime:file.mime,bytes:size,deliverable:file.deliverable};incoming.push(value);mapping.set(file.id,value)
      }
      await sessionFiles.adopt(created.id,incoming,{transferredMedia:true});await sessionFiles.tools(created.id,false)
      const messages=snapshot.messages.map(item=>{
        const message=createMessage(item.role,item.text);message.collaborationAuthor=item.author
        for(const id of item.files??[]){const file=mapping.get(id);if(!file)continue
          if(file.mime.startsWith('image/'))message.contentParts.push({type:'image',storageKey:file.key})
          else message.contentParts.push({type:'text',text:'\n['+file.name+'](sandbox:/mnt/data/'+file.path+')'})
        }
        return message
      })
      signal.throwIfAborted();await rendererApplication.sessions.insertMessages(created.id,messages);resourcesChanged(created.id);return created.id
    }catch(error){for(const ref of saved)await vault().assets.remove(ref).catch(()=>{});await deleteSession(created.id).catch(()=>{});throw error}
  },
})

let initialized=false
export function initializeCollaboration(){
  if(initialized)return;initialized=true
  void import('@/packages/session-transfer/runtime').then(module=>module.initializeSessionTransfers())
  installSharingBackground(()=>collaboration.hosts.size+[...collaboration.guests.values()].filter(room=>room.status!=='disconnected').length,()=>collaboration.stopAll())
  installCollaborationBridge((...args)=>collaboration.decision(...args),id=>!!collaboration.shared(id),id=>{const room=collaboration.shared(id);return {active:!!room,participants:room?[...room.peers.values()].filter(peer=>peer.approved).length:0,pending:room?.hitl.requests('owner').length||0}},(id,actor)=>{const peer=collaboration.shared(id)?.peers.get(actor);return !!peer?.approved&&peer.permissions.write&&peer.permissions.interact})
  const timers=new Map<string,ReturnType<typeof setTimeout>>(),resources=new Map<string,()=>void>()
  const schedule=(id:string)=>{if(!collaboration.shared(id)||timers.has(id))return;timers.set(id,setTimeout(()=>{timers.delete(id);void collaboration.refresh(id)},700))}
  rendererApplication.sessionEvents.subscribe(event=>{
    if(event.type==='session-will-delete')for(const id of event.ids){const room=collaboration.shared(id);if(room)collaboration.stop(room.id)}
    if(event.type==='session-command-committed')schedule(event.delta.header.id)
    if(event.type==='session-derived-data-patched'||event.type==='session-text-tokens-cached')schedule(event.sessionId)
  })
  collaboration.subscribe(()=>{
    void syncSharingBackground()
    notifySharedChatStatus()
    for(const room of collaboration.hosts.values())if(!resources.has(room.sessionId))resources.set(room.sessionId,subscribeSessionResources(room.sessionId,()=>schedule(room.sessionId),()=>{void vault().projects.assertSession(room.sessionId).catch(()=>collaboration.stop(room.id))}))
    for(const [id,unsubscribe]of resources)if(!collaboration.shared(id)){unsubscribe();resources.delete(id)}
  })
  const stop=()=>{collaboration.stopAll();for(const timer of timers.values())clearTimeout(timer);timers.clear()}
  window.addEventListener('chatbox:privacy-lock',stop);window.addEventListener('pagehide',stop);window.addEventListener('beforeunload',stop)
}
export function requestAuthor(messages:Message[]):SharedAuthor{return [...messages].reverse().find(message=>message.role==='user'&&!message.backgroundTask)?.collaborationAuthor||{id:'owner',name:'Owner'}}
export function sharedDecision<T>(sessionId:string,actor:string,input:HitlInput,local:(signal:AbortSignal)=>Promise<T>,encode:(value:T)=>HitlAnswer,decode:(value:HitlAnswer)=>T,signal?:AbortSignal){return collaboration.decision(sessionId,actor,input,local,encode,decode,signal)}
export {switchCurrentSession}
