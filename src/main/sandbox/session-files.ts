import path from 'node:path'
import { lstat, readdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { sessionFilePath, resourceMime, type SessionResource } from '../../shared/session-resources'
import { getSandboxArtifactsRoot, getSandboxTmpRoot, getSessionWorkingDirectory } from './manager'

export interface SessionFilesRequest { sessionId:string; action:'list'|'read'|'remove'|'write'; path?:string;content?:string }
export async function sessionDiskFiles(request:SessionFilesRequest) {
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(request.sessionId))throw new Error('Invalid session identity')
  const roots={workspace:getSessionWorkingDirectory(request.sessionId),artifacts:path.join(getSandboxArtifactsRoot(),request.sessionId)}
  const files:SessionResource[]=[];let truncated=false
  if(request.action==='list'){
    for(const [kind,root]of Object.entries(roots)){
      if(!root)continue
      let canonical:string;try{if((await lstat(root)).isSymbolicLink())continue;canonical=await realpath(root)}catch{continue}
      const owned=await realpath(path.join(getSandboxTmpRoot(),request.sessionId)).catch(()=>null)
      const readOnly=kind==='workspace'&&(!owned||canonical!==owned&&!canonical.startsWith(owned+path.sep))
      const visit=async(relative:string,depth:number):Promise<void>=>{
        if(depth>12||files.length>=2000){truncated=true;return}
        for(const entry of await readdir(path.join(canonical,relative),{withFileTypes:true})){
          if(entry.isSymbolicLink())continue
          const rel=relative?relative+'/'+entry.name:entry.name
          if(entry.isDirectory())await visit(rel,depth+1)
          else if(entry.isFile()){
            const stat=await lstat(path.join(canonical,rel))
            files.push({id:'disk:'+kind+'/'+rel,path:kind+'/'+rel,key:kind+'/'+rel,name:entry.name,mime:resourceMime(entry.name),bytes:stat.size,origin:kind==='artifacts'?'artifact':'workspace',deliverable:kind==='artifacts',updatedAt:stat.mtimeMs,readOnly})
          }
          if(files.length>=2000){truncated=true;break}
        }
      }
      await visit('',0)
    }
    return {files,truncated}
  }
  const requested=sessionFilePath(request.path??''),[kind,...parts]=requested.split('/')
  if(!['workspace','artifacts'].includes(kind)||!parts.length)throw new Error('Invalid session file path')
  const root=roots[kind as keyof typeof roots];if(!root)throw new Error('Session workspace is not available')
  if((await lstat(root)).isSymbolicLink())throw new Error('Symbolic links are not session files')
  const canonical=await realpath(root);let target=canonical
  for(const segment of parts){target=path.join(target,segment);if((await lstat(target)).isSymbolicLink())throw new Error('Symbolic links are not session files')}
  const resolved=await realpath(target)
  if(!resolved.startsWith(canonical+path.sep)||!(await lstat(resolved)).isFile())throw new Error('File is outside this session')
  if(kind==='workspace'&&['remove','write'].includes(request.action)){
    const owned=await realpath(path.join(getSandboxTmpRoot(),request.sessionId)).catch(()=>null)
    if(!owned||canonical!==owned&&!canonical.startsWith(owned+path.sep))throw new Error('External workspace files are read-only in this explorer')
  }
  if(request.action==='remove'){await unlink(resolved);return {files:[]}}
  if(request.action==='write'){if(kind!=='workspace'||typeof request.content!=='string'||Buffer.byteLength(request.content)>2*1024*1024)throw new Error('Invalid workspace edit');await writeFile(resolved,request.content,'utf8');return {files:[]}}
  if(request.action!=='read')throw new Error('Unknown session file action')
  if((await lstat(resolved)).size>20*1024*1024)throw new Error('File is too large for preview')
  return {files:[],base64:(await readFile(resolved)).toString('base64')}
}
