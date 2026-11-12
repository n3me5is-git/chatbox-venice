import {sessionFiles} from '@/packages/session-resources/files'
import {sha256} from '@noble/hashes/sha256'
import {isRagInternal} from '@shared/session-rag-policy'
import {listSessionResources,readSessionResource} from '@/packages/session-resources/service'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import platform from '@/platform'
const hashes=new Map<string,string>()
const hex=(value:Uint8Array)=>Array.from(value,n=>n.toString(16).padStart(2,'0')).join('')
const base64=(value:Uint8Array)=>{let text='';for(let i=0;i<value.length;i+=8192)text+=String.fromCharCode(...value.subarray(i,i+8192));return btoa(text)}
export async function transferMCPResource(id:string,input:{action:'list'|'read';resourceId?:string;offset:number;length:number;version?:string},signal:AbortSignal){
  const vault=vaultRuntimeFor(platform),assert=async()=>{signal.throwIfAborted();await vault.projects.assertSession(id)}
  await assert()
  if((await sessionFiles.index(id)).toolsEnabled===false)throw Error('Session workspace tools are disabled')
  const result=await listSessionResources(id,signal),visible=result.items.filter(item=>!isRagInternal(item.path))
  if(input.action==='list')return {items:visible.map(({id,path,mime,bytes,origin})=>({id,path,mime,bytes,origin})),truncated:result.truncated}
  const item=visible.find(item=>item.id===input.resourceId);if(!item)throw Error('Resource is unavailable')
  const header=item.key?await vault.assets.header(item.key):null
  let range:Uint8Array,version:string,total:number,contentHash:string
  if(header){
    await vault.projects.assertLibraryKey(header.alias)
    version=header.id;total=item.bytes??header.bytes
    if(input.version&&input.version!==version)throw Error('The resource changed; restart its transfer')
    if(input.offset>total)throw Error('Offset is outside the resource')
    let known=hashes.get(header.id)
    if(!known){
      const hash=sha256.create();let position=0
      for await(const bytes of vault.assets.read(item.key!)){try{await assert();await vault.projects.assertLibraryKey(header.alias);hash.update(bytes);position+=bytes.length}finally{bytes.fill(0)}}
      if(position!==total)throw Error('The resource length changed')
      known=hex(hash.digest());hashes.set(header.id,known)
      if(hashes.size>256)hashes.delete(hashes.keys().next().value!)
    }
    contentHash=known
    range=await vault.assets.readRange(item.key!,input.offset,Math.min(input.length,total-input.offset))

  }else{
    const {bytes}=await readSessionResource(id,item)
    try{total=bytes.length;contentHash=hex(sha256(bytes));version=contentHash;if(input.version&&input.version!==version)throw Error('The resource changed; restart its transfer');if(input.offset>total)throw Error('Offset is outside the resource');range=bytes.slice(input.offset,input.offset+input.length)}finally{bytes.fill(0)}
  }
  try{await assert();return {resourceId:item.id,mime:item.mime,offset:input.offset,bytes:range.length,total,version,sha256:contentHash,chunkSha256:hex(sha256(range)),base64:base64(range),nextOffset:input.offset+range.length<total?input.offset+range.length:null}}
  finally{range.fill(0)}
}
