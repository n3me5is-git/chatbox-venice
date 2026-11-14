import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, opendir, realpath, readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { folderIdentity, linkedPath, type FolderRequest, type FolderReply } from '../../shared/linked-folder'
type Binding={root:string;token:string;parent?:string;parentToken?:string}
const view=(bytes:{buffer:ArrayBufferLike;byteOffset:number;byteLength:number})=>new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength)
const digest=(bytes:{buffer:ArrayBufferLike;byteOffset:number;byteLength:number})=>createHash('sha256').update(view(bytes)).digest('hex')
/** Only the native picker grants roots. Generated code never receives this API. */
export class LinkedFolderBroker {
  constructor(private bindings:Record<string,Binding>,private save:()=>void,private pick:()=>Promise<string|undefined>){}
  private binding(id:string,seen=new Set<string>()):Binding|undefined { folderIdentity(id);if(seen.has(id)||seen.size>=8)throw Error("Invalid linked folder ancestry");seen.add(id);const binding=this.bindings[id];if(binding?.parent){const parent=this.binding(binding.parent,seen);if(!parent||parent.token!==binding.parentToken)throw Error('Linked folder permission expired')}return binding }
  private async resolve(id:string,relative?:string,create=false){const binding=this.binding(id);if(!binding)throw Error('No folder is linked');if((await lstat(binding.root)).isSymbolicLink())throw Error('Symbolic links are not workspace files');const root=await realpath(binding.root);if(!relative)return root;linkedPath(relative);let target=root;const parts=relative.split('/');for(let i=0;i<parts.length;i++){target=path.join(target,parts[i]);const stat=await lstat(target).catch(error=>{if(error.code==='ENOENT'&&create)return null;throw error});if(stat?.isSymbolicLink())throw Error('Symbolic links are not workspace files');if(!stat&&i<parts.length-1)await mkdir(target);if(stat&&i<parts.length-1&&!stat.isDirectory())throw Error('A file blocks this folder')}const parent=await realpath(path.dirname(target));if(parent!==root&&!parent.startsWith(root+path.sep))throw Error('File is outside this session');return target}
  async operation(input:FolderRequest):Promise<FolderReply>{
    const id=folderIdentity(input.sessionId)
    if(input.action==='pick'){const root=await this.pick();if(!root)return this.operation({sessionId:id,action:'status'});if((await lstat(root)).isSymbolicLink())throw Error('Choose a real folder');this.bindings[id]={root:await realpath(root),token:randomUUID()};this.save();return this.operation({sessionId:id,action:'status'})}
    if(input.action==='unlink'){delete this.bindings[id];this.save();return {linked:false}}
    if(id.startsWith('knowledge-')&&!['status','pick','unlink','list','read'].includes(input.action))throw Error('Knowledge source folders are read-only')
    if(input.action==='inherit'){const parentId=folderIdentity(input.parentId||'');if(parentId===id)throw Error('Invalid child workspace');if(parentId.startsWith('knowledge-'))throw Error('Knowledge source folders are read-only');const parent=this.binding(parentId);if(!parent)return {linked:false};const root=await this.resolve(parentId);const parts=['.chatbox','agents',id];let target=root;for(const part of parts){target=path.join(target,part);await mkdir(target).catch(error=>{if(error.code!=='EEXIST')throw error});if((await lstat(target)).isSymbolicLink()||!(await lstat(target)).isDirectory())throw Error('Invalid child workspace folder')}this.bindings[id]={root:await realpath(target),token:randomUUID(),parent:parentId,parentToken:parent.token};this.save();return this.operation({sessionId:id,action:'status'})}
    const binding=this.binding(id);if(!binding)return {linked:false};const status={linked:true,name:path.basename(binding.root),inherited:!!binding.parent,bindingId:binding.token};if(input.bindingId&&input.bindingId!==binding.token)throw Error('Linked folder changed')
    if(input.action==='status')return status
    if(input.action==='list'){const root=await this.resolve(id),files:NonNullable<FolderReply['files']>=[],directories:string[]=[],skipped:string[]=[];let truncated=false,scanned=0;const walk=async(relative:string,depth:number):Promise<void>=>{if(depth>16||files.length+directories.length>=2000){truncated=true;return}for await(const entry of await opendir(path.join(root,relative))){if(++scanned>2000){truncated=true;break}if(entry.isSymbolicLink()||['.chatbox','.git','node_modules','.venv'].includes(entry.name.toLowerCase()))continue;const rel=relative?relative+'/'+entry.name:entry.name;try{linkedPath(rel)}catch{continue}if(entry.isDirectory()){directories.push(rel);await walk(rel,depth+1)}else if(entry.isFile()){const target=await this.resolve(id,rel),stat=await lstat(target);if(stat.size<=10*1024*1024){const data=await readFile(target);files.push({path:rel,bytes:data.length,modified:stat.mtimeMs,version:digest(data)});data.fill(0)}else skipped.push(rel)}if(files.length+directories.length>=2000){truncated=true;break}}};await walk('',0);return {...status,files,directories,skipped,truncated}}
    const relative=linkedPath(input.path||''),target=await this.resolve(id,relative,input.action==='write'||input.action==='mkdir')
    if(input.action==='mkdir'){await mkdir(target,{recursive:false}).catch(error=>{if(error.code!=='EEXIST')throw error});if(!(await lstat(target)).isDirectory())throw Error('A file blocks this folder');return status}
    const stat=await lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error});if(stat&&!stat.isFile())throw Error('Choose a file');if(stat&&stat.size>10*1024*1024)throw Error('Session files must not exceed 10 MB')
    const previous=stat?await readFile(target):null,version=previous?digest(previous):null
    try{
      if(input.expectedVersion!==undefined&&input.expectedVersion!==version)throw Error('This file changed. Read the current version before writing again.')
      if(input.action==='read'){if(!previous)throw Error('Session file not found');return {...status,base64:previous.toString('base64'),version:version!}}
      if(input.action==='remove'){if(!previous)throw Error('Session file not found');await unlink(target);return status}
      if(input.action!=='write'||typeof input.base64!=='string'||input.base64.length>14*1024*1024)throw Error('Invalid workspace operation')
      const bytes=Buffer.from(input.base64,'base64');try{if(bytes.length>10*1024*1024)throw Error('Session files must not exceed 10 MB');await writeFile(target,view(bytes),{flag:stat?'r+':'wx'});if(stat){const {truncate}=await import('node:fs/promises');await truncate(target,bytes.length)}return {...status,version:digest(bytes)}}finally{bytes.fill(0)}
    }finally{previous?.fill(0)}
  }
}
