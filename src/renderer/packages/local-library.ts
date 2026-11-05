import platform from '@/platform'
import { currentBlobStorage } from '@/adapters/CurrentBlobStorage'
import { veniceMediaService } from '@/packages/venice/service'
import { installedVaultFor } from '@/packages/vault/runtime'
export type ContentKind = 'image'|'audio'|'video'|'document'
export type LibraryKind = ContentKind|'vault'
export type LocalLibraryItem = { id:string; name:string; kind:ContentKind; key:string; mime?:string; thumbnail?:string }
export function acceptsLocalFile(file: Pick<File,'name'|'type'>, accept='') {
  if(!accept.trim()) return true
  return accept.split(',').map(value=>value.trim().toLowerCase()).some(value=>value.startsWith('.')?file.name.toLowerCase().endsWith(value):value.endsWith('/*')?file.type.toLowerCase().startsWith(value.slice(0,-1)):file.type.toLowerCase()===value)
}
export async function localLibraryPage(kind:LibraryKind,cursor=0,protection:'public'|'protected'='public'):Promise<{items:LocalLibraryItem[];next:number|null}> {
  const access=installedVaultFor(platform)?.projects
  if(kind==='vault'){
    const {vaultRuntimeFor}=await import('@/packages/vault/runtime');const vault=vaultRuntimeFor(platform);const page=await vault.db.page(protection==='public'?'public':undefined,cursor,20);const items:LocalLibraryItem[]=[]
    for(const header of page.items){if(protection==='protected'&&header.scope==='public'||!vault.keys.isUnlocked(header.scope)||access&&!await access.libraryKeyVisible(header.alias))continue;const info=await vault.assets.info(header);if(!['image','audio','video','document'].includes(info.kind))continue;await access?.assertLibraryKey(header.alias);items.push({id:'vault:'+header.id,name:info.name,kind:info.kind as ContentKind,key:`vault-asset-${header.id}`,mime:info.mime})}
    return {items,next:page.next}
  }
  if(kind==='image'){
    const storage=platform.getImageGenerationStorage();await storage.initialize();const page=await storage.getPage(cursor,20)
    const items:LocalLibraryItem[]=[];for(const record of page.items){if(record.protection)continue;for(const [index,key] of record.generatedImages.entries())if(!access||await access.libraryKeyVisible(key))items.push({id:`image:${record.id}:${index}`,name:record.prompt.slice(0,100)||'Saved image',kind,key,thumbnail:record.generatedImageThumbnails?.[index]})}return {items,next:page.nextCursor}
  }
  if(kind==='audio'||kind==='video'){
    const records=(await veniceMediaService.list()).filter(record=>!record.protection&&record.status==='ready'&&record.blobKey&&(kind==='video'?record.kind==='video':record.kind!=='video'))
    if(access)for(let n=records.length-1;n>=0;n--)if(!await access.libraryKeyVisible(records[n].blobKey))records.splice(n,1)
    return {items:records.slice(cursor,cursor+20).map(record=>({id:'media:'+record.id,name:record.prompt.slice(0,100)||record.model,kind,key:record.blobKey!,mime:record.mime})),next:cursor+20<records.length?cursor+20:null}
  }
  // Legacy document blobs contain parsed text, not the original PDF/Office binary.
  const keys=(await platform.listStoreBlobKeys()).filter(key=>key.startsWith('file:'))
  if(access)for(let n=keys.length-1;n>=0;n--)if(!await access.libraryKeyVisible(keys[n]))keys.splice(n,1)
  return {items:keys.slice(cursor,cursor+20).map(key=>({id:key,name:'Saved text attachment',kind,key,mime:'text/plain'})),next:cursor+20<keys.length?cursor+20:null}
}
export async function localLibraryFile(item:LocalLibraryItem):Promise<File> {
  const access=installedVaultFor(platform)?.projects
  if(item.key.startsWith('vault-asset-')){
    const {vaultRuntimeFor}=await import('@/packages/vault/runtime');const vault=vaultRuntimeFor(platform);const header=await vault.assets.header(item.key);if(!header)throw new Error('This local item is no longer available');await access?.assertLibraryKey(header.alias);const info=await vault.assets.info(header);const chunks:Uint8Array<ArrayBuffer>[]=[]
    try{for await(const bytes of vault.assets.read(item.key)){await access?.assertLibraryKey(header.alias);chunks.push(bytes)}await access?.assertLibraryKey(header.alias);const extension=info.mime.split('/')[1]?.replace('jpeg','jpg').replace('mpeg','mp3')||'bin';return new File(chunks,`Saved-${header.id}.${extension}`,{type:info.mime})}finally{for(const bytes of chunks)bytes.fill(0)}
  }
  await access?.assertLibraryKey(item.key)
  const data=item.key.startsWith('data:')?item.key:await currentBlobStorage.get(item.key)
  await access?.assertLibraryKey(item.key)
  if(!data)throw new Error('This local item is no longer available')
  if(item.kind==='document'&&!data.startsWith('data:'))return new File([data],item.name+'.txt',{type:'text/plain'})
  const match=/^data:((?:image|audio|video)\/[\w.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(data)
  if(!match)throw new Error('Only on-device media can be attached from this library')
  const binary=atob(match[2]);if(binary.length>128*1024*1024)throw new Error('This item exceeds the local attachment size limit')
  const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
  const ext=match[1].split('/')[1].replace('mpeg','mp3').replace('jpeg','jpg')
  return new File([bytes],`Saved-${item.kind}-${item.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(-40)}.${ext}`,{type:match[1]})
}
