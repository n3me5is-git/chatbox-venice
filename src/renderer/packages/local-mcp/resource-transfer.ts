import {sessionFiles} from '@/packages/session-resources/files'
import {sha256} from '@noble/hashes/sha256'
import {isRagInternal} from '@shared/session-rag-policy'
import type {SessionResource} from '@shared/session-resources'
import {veniceMediaExtension} from '@shared/providers/definitions/models/venice/catalog'
import {listGeneratedSessionResources,listSessionResources,readSessionResource} from '@/packages/session-resources/service'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import platform from '@/platform'
const hashes=new Map<string,string>()
const hex=(value:Uint8Array)=>Array.from(value,n=>n.toString(16).padStart(2,'0')).join('')
const base64=(value:Uint8Array)=>{let text='';for(let i=0;i<value.length;i+=8192)text+=String.fromCharCode(...value.subarray(i,i+8192));return btoa(text)}
const imageExtensions = new Map([
  ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'],
  ['image/gif', 'gif'], ['image/avif', 'avif'], ['image/bmp', 'bmp'],
])
function downloadDetails(item: SessionResource, mime = item.mime) {
  if (item.origin === 'media') {
    const basename = item.path.split('/').at(-1) || item.recordId || item.id
    const extension = veniceMediaExtension(mime)
    return { mime, filename: extension ? basename.replace(/\.[^.]+$/, '') + '.' + extension : basename }
  }
  const extension = item.origin === 'image' ? imageExtensions.get(mime) : undefined
  return { mime, filename: extension ? item.name.replace(/\.[^.]+$/, '.' + extension) : item.name }
}
export async function transferMCPResource(id:string,input:{action:'list'|'read';resourceId?:string;generationId?:string;offset:number;length:number;version?:string},signal:AbortSignal){
  const vault=vaultRuntimeFor(platform),assert=async()=>{signal.throwIfAborted();await vault.projects.assertSession(id)}
  await assert()
  if((await sessionFiles.index(id)).toolsEnabled===false)throw Error('Session workspace tools are disabled')
  const result=input.generationId ? await listGeneratedSessionResources(id,input.generationId,signal) : await listSessionResources(id,signal)
  const visible=result.items.filter(item=>!isRagInternal(item.path))
  if(input.action==='list'){
    const items = []
    for (const item of visible) {
      signal.throwIfAborted()
      const { id, path, key, bytes, origin, recordId } = item
      const header = origin === 'image' && key ? await vault.assets.header(key) : null
      if (header) await vault.projects.assertLibraryKey(header.alias)
      const mime = header ? (await vault.assets.info(header)).mime : item.mime
      items.push({ id, path, bytes, origin, recordId, ...downloadDetails(item, mime) })
    }
    await assert()
    return { items, truncated: result.truncated }
  }
  const item=visible.find(item=>item.id===input.resourceId);if(!item)throw Error('Resource is unavailable')
  const header=item.key?await vault.assets.header(item.key):null
  let range:Uint8Array,version:string,total:number,contentHash:string,mime=item.mime
  if(header){
    await vault.projects.assertLibraryKey(header.alias)
    const info = item.origin === 'image' || item.bytes === 0 ? await vault.assets.info(header) : undefined
    if (item.origin === 'image' && info) mime = info.mime
    const ref = 'vault-asset-' + header.id
    version=header.id;total=item.bytes===0&&info?.logicalBytes===0?0:header.bytes
    if(input.version&&input.version!==version)throw Error('The resource changed; restart its transfer')
    if(input.offset>total)throw Error('Offset is outside the resource')
    let known=total===0?hex(sha256(new Uint8Array())):hashes.get(header.id)
    if(!known){
      const hash=sha256.create();let position=0
      for await(const bytes of vault.assets.read(ref)){try{await assert();await vault.projects.assertLibraryKey(header.alias);hash.update(bytes);position+=bytes.length}finally{bytes.fill(0)}}
      if(position!==total)throw Error('The resource length changed')
      known=hex(hash.digest());hashes.set(header.id,known)
      if(hashes.size>256)hashes.delete(hashes.keys().next().value!)
    }
    contentHash=known
    range=await vault.assets.readRange(ref,input.offset,Math.min(input.length,total-input.offset))

  }else{
    const {bytes}=await readSessionResource(id,item)
    try{total=bytes.length;contentHash=hex(sha256(bytes));version=contentHash;if(input.version&&input.version!==version)throw Error('The resource changed; restart its transfer');if(input.offset>total)throw Error('Offset is outside the resource');range=bytes.slice(input.offset,input.offset+input.length)}finally{bytes.fill(0)}
  }
  try{await assert();if(header){await vault.projects.assertLibraryKey(header.alias);if((await vault.assets.header(item.key!))?.id!==version)throw Error('The resource changed; restart its transfer')}return {resourceId:item.id,...downloadDetails(item,mime),offset:input.offset,bytes:range.length,total,version,sha256:contentHash,chunkSha256:hex(sha256(range)),base64:base64(range),nextOffset:input.offset+range.length<total?input.offset+range.length:null}}
  finally{range.fill(0)}
}
