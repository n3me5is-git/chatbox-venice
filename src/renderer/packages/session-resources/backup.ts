import { sessionFilePath, type SessionFile } from '@shared/session-resources'
import { exportVault, importVault } from '@/packages/vault/backup'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { resourcesChanged, sessionFiles } from './files'

/** Workspace archives include intermediate files too, unlike the media-library view. */
export async function exportSessionWorkspace(id:string,password:string,signal:AbortSignal){
  const files=await sessionFiles.list(id),keys=new Set(files.map(file=>file.key)),vault=vaultRuntimeFor(platform)
  const scopes=new Set<string>(),temporary:string[]=[]
  try{
    for(const file of files){
      signal.throwIfAborted();await vault.projects.assertSession(id)
      if(file.key.startsWith('linked:')){const {bytes}=await sessionFiles.read(id,file.path),alias='workspace-export:'+crypto.randomUUID();try{const scope=await vault.projects.sessionScope(id)||'public';const saved=await vault.assets.put((async function*(){yield bytes.length?bytes:new Uint8Array([0])})(),{kind:'document',name:file.name,mime:file.mime,sessionId:id,resourcePath:file.path,deliverable:!!file.deliverable,logicalBytes:file.bytes},scope,alias,signal);temporary.push(saved);keys.add(alias)}finally{bytes.fill(0)}}
      else{const header=await vault.assets.header(file.key);if(!header)throw new Error('Session file not found');await vault.keys.key(header.scope);scopes.add(header.scope)}
    }
    for(const ref of temporary){const header=await vault.assets.header(ref);if(header){await vault.keys.key(header.scope);scopes.add(header.scope)}}
    await platform.exporter.exportStreamingFile('Session-files-'+new Date().toISOString().slice(0,10)+'.chatboxvault',()=>exportVault(vault.assets,password,scopes,signal,async header=>{await vault.projects.assertSession(id);return keys.has(header.alias||'')}),'application/octet-stream',signal,{requiresStreaming:true})
  }finally{for(const ref of temporary)await vault.assets.remove(ref).catch(()=>{})}
}
export async function restoreSessionWorkspace(id:string,file:Blob,password:string,signal:AbortSignal){
  if((await (await import('./linked-folder')).linkedFolderOperation({sessionId:id,action:'status'})).linked)throw Error('Use app storage before restoring a backup into a linked workspace')
  const vault=vaultRuntimeFor(platform),existing=await sessionFiles.list(id),scope=(await vault.assets.header(existing[0]?.key||''))?.scope||await vault.projects.sessionScope(id)||'public'
  const created:string[]=[],temporary:string[]=[],incoming:SessionFile[]=[],prefix='restored-'+crypto.randomUUID().slice(0,8)+'/'
  try{
    await importVault(vault.assets,vault.legacy,file,password,scope,signal,async refs=>{
      temporary.push(...refs)
      for(const ref of refs){
        signal.throwIfAborted();await vault.projects.assertSession(id)
        const header=await vault.assets.header(ref);if(!header)continue
        const info=await vault.assets.info(header)
        if(!info.resourcePath||!info.sessionId||info.kind==='chat')continue
        if(info.logicalBytes!==undefined&&info.logicalBytes!==0&&info.logicalBytes!==header.bytes)throw new Error('Invalid restored file length')
        const original=sessionFilePath(info.resourcePath),path=sessionFilePath(existing.some(file=>file.path===original)||incoming.some(file=>file.path===original)?prefix+original:original)
        const key='session-file:'+encodeURIComponent(id)+':'+crypto.randomUUID()
        const saved=await vault.assets.put(vault.assets.read(ref),{...info,sessionId:id,resourcePath:path},scope,key,signal);created.push(saved)
        incoming.push({id:crypto.randomUUID(),origin:'file',path,name:path.split('/').pop()!,key,mime:info.mime,bytes:info.logicalBytes??header.bytes,deliverable:!!info.deliverable,updatedAt:Date.now()})
      }
      if(!incoming.length)throw new Error('This backup contains no session workspace files')
      signal.throwIfAborted();await sessionFiles.adopt(id,incoming,{transferredMedia:true})
    })
  }catch(error){for(const ref of created)await vault.assets.remove(ref).catch(()=>{});throw error}
  finally{for(const ref of temporary)await vault.assets.remove(ref).catch(()=>{})}
  resourcesChanged(id);return incoming.length
}
