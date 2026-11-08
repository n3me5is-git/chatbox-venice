import { EncryptedChunkStore,type AssetHeader,type AssetInfo,type CipherBlobStore } from './chunk-store'
import { decode64,encode64,open,pinKey,seal,type SealedBytes } from './crypto'
type BackupRecord={type:'asset';info:AssetInfo;protected:boolean}|{type:'chunk';data:string}|{type:'asset-end';bytes:number;chunks:number}|{type:'end';assets:number;records:number}
const MAX_LINE=4*1024*1024
const encoder=new TextEncoder()
function passwordCheck(password:string){if(password.length<12)throw new Error('Use a backup passphrase of at least 12 characters')}
/** Every record is AEAD-authenticated with its position; the mandatory footer detects truncation. */
export async function* exportVault(assets:EncryptedChunkStore,password:string,scopes:ReadonlySet<string>,signal?:AbortSignal,visible?:(header:AssetHeader)=>Promise<boolean>):AsyncGenerator<Uint8Array>{
  passwordCheck(password);const salt=crypto.getRandomValues(new Uint8Array(16));const key=await pinKey(password,salt);const header={format:'chatbox-vault-backup',version:1,salt:encode64(salt)};const prefix=JSON.stringify(header);yield encoder.encode(prefix+'\n');let sequence=0,count=0
  const record=async(value:BackupRecord)=>encoder.encode(JSON.stringify(await seal(key,encoder.encode(JSON.stringify(value)),`${prefix}:${sequence++}`))+'\n')
  for await(const item of assets.index.all()){
    signal?.throwIfAborted();if(item.status!=='ready'||!scopes.has(item.scope)||visible&&!await visible(item))continue
    yield await record({type:'asset',info:await assets.info(item),protected:item.scope!=='public'});let bytes=0,chunks=0
    for await(const chunk of assets.read(`vault-asset-${item.id}`)){signal?.throwIfAborted();try{if(visible&&!await visible(item))throw new Error('A protected project was locked during backup');yield await record({type:'chunk',data:encode64(chunk)});bytes+=chunk.length;chunks++}finally{chunk.fill(0)}}
    yield await record({type:'asset-end',bytes,chunks});count++
  }
  yield await record({type:'end',assets:count,records:sequence})
}
async function* lines(file:Blob,signal?:AbortSignal){const reader=file.stream().getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let pending='';try{while(true){signal?.throwIfAborted();const value=await reader.read();if(value.done)break;pending+=decoder.decode(value.value,{stream:true});let newline:number;while((newline=pending.indexOf('\n'))>=0){if(newline>MAX_LINE)throw new Error('Backup record exceeds the size limit');yield pending.slice(0,newline);pending=pending.slice(newline+1)}if(pending.length>MAX_LINE)throw new Error('Backup record exceeds the size limit')}pending+=decoder.decode();if(pending.length)throw new Error('The backup is incomplete')}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}}
/** Stage only encrypted records. Verify the complete file before publishing any restored content. */
export async function importVault(assets:EncryptedChunkStore,temporary:CipherBlobStore,file:Blob,password:string,targetScope:string,signal?:AbortSignal,onRestored?:(refs:readonly string[])=>Promise<void>){
  passwordCheck(password);const id=crypto.randomUUID(),stage=(n:number)=>`vault-backup-stage-${id}-${n}`;let staged=0;const imported:string[]=[],lease=`vault-backup-lease-${id}`
  try{
    await temporary.set(lease,JSON.stringify({updatedAt:Date.now()}))
    let prefix:string|undefined,key:CryptoKey|undefined,footer=false,expectedAssets=0,started=0,ended=0,openAsset=false
    for await(const line of lines(file,signal)){
      if(prefix===undefined){const header=JSON.parse(line);if(header.format!=='chatbox-vault-backup'||header.version!==1||typeof header.salt!=='string'||decode64(header.salt).length!==16)throw new Error('Unsupported encrypted library backup');prefix=line;key=await pinKey(password,decode64(header.salt));continue}
      if(footer)throw new Error('Unexpected content after the backup footer')
      const bytes=await open(key!,JSON.parse(line) as SealedBytes,`${prefix}:${staged}`);let value:BackupRecord;try{value=JSON.parse(new TextDecoder().decode(bytes))}finally{bytes.fill(0)}
      if(value.type==='end'){if(value.records!==staged||value.assets!==started||started!==ended||openAsset)throw new Error('The backup manifest is incomplete');expectedAssets=value.assets;footer=true;continue}
      if(value.type==='asset'){if(openAsset||!value.info||typeof value.info.name!=='string'||typeof value.info.mime!=='string'||!['image','audio','video','document','chat','thumbnail'].includes(value.info.kind))throw new Error('Invalid backup item');openAsset=true;started++}
      else if(value.type==='asset-end'){if(!openAsset||!Number.isSafeInteger(value.bytes)||!Number.isInteger(value.chunks)||value.chunks<1||value.bytes<1||value.bytes>assets.maximum)throw new Error('Invalid backup item length');openAsset=false;ended++}
      else if(value.type==='chunk'){if(!openAsset||typeof value.data!=='string'||value.data.length>1500000)throw new Error('Invalid backup content block')}
      else throw new Error('Unknown backup record')
      await temporary.set(stage(staged++),line);if(staged%32===0)await temporary.set(lease,JSON.stringify({updatedAt:Date.now()}))
    }
    if(!footer||!key||!prefix)throw new Error('The encrypted backup is incomplete')
    let at=0
    const readRecord=async()=>{const line=await temporary.get(stage(at));if(!line)throw new Error('Staged backup content is missing');const bytes=await open(key!,JSON.parse(line),`${prefix}:${at++}`);try{return JSON.parse(new TextDecoder().decode(bytes)) as BackupRecord}finally{bytes.fill(0)}}
    while(at<staged){signal?.throwIfAborted();const record=await readRecord();if(record.type!=='asset')throw new Error('Invalid restored item')
      async function* source(){let bytes=0,chunks=0;while(at<staged){const next=await readRecord();if(next.type==='asset-end'){if(next.bytes!==bytes||next.chunks!==chunks)throw new Error('Backup content length mismatch');return}if(next.type!=='chunk')throw new Error('Invalid restored content');const chunk=decode64(next.data);try{bytes+=chunk.length;chunks++;yield chunk}finally{chunk.fill(0)}}throw new Error('Restored content is incomplete')}
      // New identities prevent restore from replacing a file already referenced by a chat.
      imported.push(await assets.put(source(),record.info,targetScope,undefined,signal))
    }
    if(imported.length!==expectedAssets)throw new Error('Backup item count mismatch');await onRestored?.(imported);return imported.length
  }catch(error){for(const ref of imported)await assets.remove(ref).catch(()=>{});throw error}
  finally{for(let n=0;n<staged;n++)await temporary.remove(stage(n)).catch(()=>{});await temporary.remove(lease).catch(()=>{})}
}
