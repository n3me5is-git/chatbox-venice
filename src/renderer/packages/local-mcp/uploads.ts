import {sha256} from '@noble/hashes/sha256'
import {z} from 'zod'
import {sessionFilePath,resourceName} from '@shared/session-resources'
import type {LocalMCPGrant} from '@shared/local-mcp'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import platform from '@/platform'
import {sessionFiles} from '@/packages/session-resources/files'
import {localMCPOwner} from './temporary'
const KEY='local-mcp:uploads:v1',vault=()=>vaultRuntimeFor(platform)
const hex=(v:Uint8Array)=>Array.from(v,n=>n.toString(16).padStart(2,'0')).join('')
type Upload={id:string;sessionId:string;owner:string;fingerprint:string;parts:{ref:string;hash:string;size:number}[];finalKey?:string;published?:boolean}
let tail:Promise<unknown>=Promise.resolve()
export const mcpUploadSchema=z.object({sessionId:z.string().optional(),uploadId:z.string().uuid(),path:z.string().max(512),mime:z.string().regex(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/),totalBytes:z.number().int().min(1).max(128*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),index:z.number().int().min(0).max(511),base64:z.string().max(350000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),final:z.boolean().default(false)}).strict()
const rows=async()=>await vault().db.getSetting<Upload[]>(KEY)||[]
async function save(row:Upload){for(let i=0;i<20;i++){const old=await vault().db.getSetting<Upload[]>(KEY);if(await vault().db.setSettingIfUnchanged(KEY,old,[...(old||[]).filter(x=>x.id!==row.id),row]))return}throw Error('Upload metadata changed')}
export async function uploadMCPFile(grant:LocalMCPGrant,id:string,input:z.infer<typeof mcpUploadSchema>,signal:AbortSignal){
  const work=tail.catch(()=>{}).then(async()=>{
    const access=async()=>{signal.throwIfAborted();await vault().projects.assertSession(id)};await access()
    if((await sessionFiles.index(id)).toolsEnabled===false)throw Error('Session workspace tools are disabled')
    const own=await localMCPOwner(grant),path=sessionFilePath(input.path),fingerprint=hex(sha256(new TextEncoder().encode(JSON.stringify([path,input.mime,input.totalBytes,input.sha256]))))
    let row=(await rows()).find(x=>x.id===input.uploadId)
    if(row&&(row.owner!==own||row.sessionId!==id||row.fingerprint!==fingerprint))throw Error('This upload identity belongs to a different request')
    if(!row){if(input.index!==0)throw Error('Start an upload at index zero');if((await rows()).filter(x=>x.owner===own&&!x.published).length>=8)throw Error('Finish or clean up another upload first');row={id:input.uploadId,sessionId:id,owner:own,fingerprint,parts:[]};await save(row)}
    const bytes=Uint8Array.from(atob(input.base64),c=>c.charCodeAt(0))
    try{
      if(!bytes.length||bytes.length>256*1024)throw Error('Upload chunks must contain 1–262144 bytes')
      const hash=hex(sha256(bytes)),prior=row.parts[input.index]
      if(prior){if(prior.hash!==hash||prior.size!==bytes.length)throw Error('This chunk differs from the existing upload')}
      else{
        if(row.published||input.index!==row.parts.length)throw Error('Upload chunks must be sequential')
        if(row.parts.reduce((n,p)=>n+p.size,0)+bytes.length>input.totalBytes)throw Error('Upload exceeds the declared length')
        const ref='mcp-upload:'+crypto.randomUUID();row.parts.push({ref,hash,size:bytes.length});await save(row)
        await vault().assets.put((async function*(){yield bytes})(),{name:'MCP upload chunk',mime:'application/octet-stream',kind:'document',sessionId:id,hidden:true},await vault().projects.sessionScope(id)||'public',ref,signal)
      }
      if(prior&&!row.published&&!await vault().assets.header(prior.ref))await vault().assets.put((async function*(){yield bytes})(),{name:'MCP upload chunk',mime:'application/octet-stream',kind:'document',sessionId:id,hidden:true},await vault().projects.sessionScope(id)||'public',prior.ref,signal)
      if(row.published)return {complete:true,path,sha256:input.sha256}
      if(!input.final)return {nextIndex:row.parts.length,receivedBytes:row.parts.reduce((n,p)=>n+p.size,0)}
      if(row.parts.reduce((n,p)=>n+p.size,0)!==input.totalBytes)throw Error('Upload is incomplete')
      const upload=row,hashAll=sha256.create()
      const stream=async function*(){for(const part of upload.parts)for await(const chunk of vault().assets.read(part.ref)){try{await access();hashAll.update(chunk);yield chunk}finally{chunk.fill(0)}}if(hex(hashAll.digest())!==input.sha256)throw Error('Upload SHA-256 does not match')}
      const key=row.finalKey||'session-file:'+encodeURIComponent(id)+':'+crypto.randomUUID()
      if(!row.finalKey){row.finalKey=key;await save(row)}
      if(!await vault().assets.header(key))await vault().assets.put(stream(),{name:resourceName(path),mime:input.mime,kind:input.mime.startsWith('image/')?'image':input.mime.startsWith('audio/')?'audio':input.mime.startsWith('video/')?'video':'document',sessionId:id,resourcePath:path,deliverable:false},await vault().projects.sessionScope(id)||'public',key,signal)
      await access()
      const existing=(await sessionFiles.list(id)).find(file=>file.key===key)
      if(!existing)await sessionFiles.adopt(id,[{id:crypto.randomUUID(),path,name:resourceName(path),key,mime:input.mime,bytes:input.totalBytes,origin:'file',updatedAt:Date.now(),deliverable:false}],{transferredMedia:true})
      row.published=true;await save(row)
      for(const part of row.parts)await vault().assets.remove(part.ref)
      return {complete:true,path,bytes:input.totalBytes,sha256:input.sha256}
    }finally{bytes.fill(0)}
  });tail=work;return work
}
export async function cleanupMCPUploads(owner:string,sessionId?:string){
  const work=tail.catch(()=>{}).then(async()=>{
    const chosen=(await rows()).filter(x=>x.owner===owner&&(!sessionId||x.sessionId===sessionId))
    for(const row of chosen){for(const part of row.parts)await vault().assets.remove(part.ref);if(row.finalKey&&!row.published&&!(await sessionFiles.list(row.sessionId)).some(file=>file.key===row.finalKey))await vault().assets.remove(row.finalKey)}
    for(let i=0;i<20;i++){const old=await vault().db.getSetting<Upload[]>(KEY);if(await vault().db.setSettingIfUnchanged(KEY,old,(old||[]).filter(x=>!chosen.some(y=>y.id===x.id))))return}throw Error('Upload cleanup changed')
  });tail=work;return work
}
