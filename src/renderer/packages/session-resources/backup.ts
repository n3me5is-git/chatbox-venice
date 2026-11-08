import { sessionFilePath, type SessionFile } from '@shared/session-resources'
import { exportVault, importVault } from '@/packages/vault/backup'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { resourcesChanged, sessionFiles } from './files'

/** Workspace archives include intermediate files too, unlike the media-library view. */
export async function exportSessionWorkspace(id:string,password:string,signal:AbortSignal){
  const files=await sessionFiles.list(id),keys=new Set(files.map(file=>file.key)),vault=vaultRuntimeFor(platform)
  const scopes=new Set<string>()
  for(const file of files){const header=await vault.assets.header(file.key);if(!header)throw new Error('Session file not found');await vault.keys.key(header.scope);scopes.add(header.scope)}
  await platform.exporter.exportStreamingFile('Session-files-'+new Date().toISOString().slice(0,10)+'.chatboxvault',()=>exportVault(vault.assets,password,scopes,signal,async header=>{await vault.projects.assertSession(id);return keys.has(header.alias||'')}),'application/octet-stream',signal,{requiresStreaming:true})
}
export async function restoreSessionWorkspace(id:string,file:Blob,password:string,signal:AbortSignal){
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
      signal.throwIfAborted();await sessionFiles.adopt(id,incoming)
    })
  }catch(error){for(const ref of created)await vault.assets.remove(ref).catch(()=>{});throw error}
  finally{for(const ref of temporary)await vault.assets.remove(ref).catch(()=>{})}
  resourcesChanged(id);return incoming.length
}
