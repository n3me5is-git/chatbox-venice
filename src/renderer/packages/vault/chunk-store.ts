import { aesKey, decode64, encode64, open, seal, type SealedBytes } from './crypto'
export type AssetInfo={name:string;mime:string;kind:'image'|'audio'|'video'|'document'|'chat'|'thumbnail';prompt?:string;model?:string;sourceId?:string;sessionId?:string;resourcePath?:string;deliverable?:boolean;hidden?:boolean;logicalBytes?:number}
export type AssetHeader={version:1;id:string;alias?:string;scope:string;createdAt:number;bytes:number;chunks:number;status:'writing'|'ready';key:SealedBytes;info:SealedBytes;manifest?:SealedBytes}
export interface CipherBlobStore {get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>;remove(key:string):Promise<void>;keys():Promise<string[]>}
export interface AssetIndex {get(id:string):Promise<AssetHeader|null>;byAlias(alias:string):Promise<AssetHeader|null>;put(header:AssetHeader):Promise<void>;remove(id:string):Promise<void>;page(scope:string|undefined,cursor:number,limit:number):Promise<{items:AssetHeader[];next:number|null}>;all():AsyncIterable<AssetHeader>}
export class VaultLockedError extends Error {readonly name='VaultLockedError';constructor(public readonly scope:string){super('Unlock this protected content to continue')}}
const CHUNK=1024*1024
const keyFor=(id:string,index:number)=>`vault-v1-${id}-chunk-${index}`
const checkId=(id:string)=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid vault asset identity')}
export class EncryptedChunkStore {
  constructor(readonly blobs:CipherBlobStore,readonly index:AssetIndex,private readonly scopeKey:(scope:string)=>Promise<CryptoKey>,readonly maximum=128*1024*1024){}
  async put(source:AsyncIterable<Uint8Array>,info:AssetInfo,scope='public',alias?:string,signal?:AbortSignal) {
    const id=crypto.randomUUID();const raw=crypto.getRandomValues(new Uint8Array(32));let key:CryptoKey;let header:AssetHeader
    try{key=await aesKey(raw);header={version:1,id,alias,scope,createdAt:Date.now(),bytes:0,chunks:0,status:'writing',key:await seal(await this.scopeKey(scope),raw,`${id}:key:${scope}:${alias||''}`),info:await seal(key,new TextEncoder().encode(JSON.stringify(info)),`${id}:info`)}}finally{raw.fill(0)}
    await this.index.put(header)
    const buffer=new Uint8Array(CHUNK);let filled=0
    const flush=async()=>{signal?.throwIfAborted();const sealed=await seal(key,buffer.subarray(0,filled),`${id}:chunk:${header.chunks}`);await this.blobs.set(keyFor(id,header.chunks),JSON.stringify(sealed));header.chunks++;filled=0}
    try{
      for await(const bytes of source){signal?.throwIfAborted();header.bytes+=bytes.byteLength;if(header.bytes>this.maximum)throw new Error('Media exceeds the encrypted library size limit');let offset=0;while(offset<bytes.length){const count=Math.min(CHUNK-filled,bytes.length-offset);buffer.set(bytes.subarray(offset,offset+count),filled);filled+=count;offset+=count;if(filled===CHUNK)await flush()}}
      if(!header.bytes)throw new Error('Cannot store an empty media response')
      if(filled)await flush();signal?.throwIfAborted();await this.scopeKey(scope);header.manifest=await seal(key,new TextEncoder().encode(JSON.stringify({bytes:header.bytes,chunks:header.chunks})),`${id}:manifest`);header.status='ready';await this.index.put(header)
      return `vault-asset-${id}`
    }catch(error){await this.index.remove(id).catch(()=>{});for(let n=0;n<header.chunks;n++)await this.blobs.remove(keyFor(id,n)).catch(()=>{});throw error}finally{buffer.fill(0)}
  }
  async header(ref:string) {return ref.startsWith('vault-asset-')?this.index.get(ref.slice(12)):this.index.byAlias(ref)}
  private async dataKey(header:AssetHeader){checkId(header.id);const raw=await open(await this.scopeKey(header.scope),header.key,`${header.id}:key:${header.scope}:${header.alias||''}`);try{if(raw.length!==32)throw new Error('Invalid encrypted content key');return await aesKey(raw)}finally{raw.fill(0)}}
  async info(header:AssetHeader):Promise<AssetInfo>{const bytes=await open(await this.dataKey(header),header.info,`${header.id}:info`);try{await this.scopeKey(header.scope);return JSON.parse(new TextDecoder().decode(bytes)) as AssetInfo}finally{bytes.fill(0)}}
  async describe(ref:string,info:AssetInfo){const header=await this.header(ref);if(!header||header.status!=='ready')throw new Error('Encrypted item not found');const sealed=await seal(await this.dataKey(header),new TextEncoder().encode(JSON.stringify(info)),`${header.id}:info`);await this.scopeKey(header.scope);await this.index.put({...header,info:sealed})}
  async *read(ref:string):AsyncGenerator<Uint8Array<ArrayBuffer>> {
    const header=await this.header(ref);if(!header||header.status!=='ready')throw new Error('This encrypted item is unavailable')
    const key=await this.dataKey(header);let total=0
    if(!header.manifest)throw new Error('Encrypted content has no authenticated manifest')
    const manifest=JSON.parse(new TextDecoder().decode(await open(key,header.manifest,`${header.id}:manifest`)))
    if(manifest.bytes!==header.bytes||manifest.chunks!==header.chunks)throw new Error('Encrypted content manifest was modified')
    if(!Number.isInteger(header.chunks)||header.chunks<1||header.chunks>Math.ceil(this.maximum/CHUNK))throw new Error('Invalid encrypted content manifest')
    for(let n=0;n<header.chunks;n++){
      const value=await this.blobs.get(keyFor(header.id,n));if(!value)throw new Error('Encrypted content is incomplete')
      const bytes=await open(key,JSON.parse(value),`${header.id}:chunk:${n}`);total+=bytes.length
      if(bytes.length>CHUNK||(n<header.chunks-1&&bytes.length!==CHUNK)||total>header.bytes)throw new Error('Encrypted content length mismatch')
      await this.scopeKey(header.scope);yield bytes
    }
    await this.scopeKey(header.scope);if(total!==header.bytes)throw new Error('Encrypted content was truncated')
  }
  /** Authenticated bounded random access for local transfers; decrypt only intersecting chunks. */
  async readRange(ref:string,offset:number,length:number){
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<0||length>256*1024)throw Error('Invalid encrypted file range')
    const header=await this.header(ref);if(!header||header.status!=='ready')throw Error('This encrypted item is unavailable')
    const key=await this.dataKey(header)
    if(!header.manifest)throw Error('Encrypted content has no authenticated manifest')
    const encoded=await open(key,header.manifest,header.id+':manifest')
    let manifest:{bytes:number;chunks:number};try{manifest=JSON.parse(new TextDecoder().decode(encoded))}finally{encoded.fill(0)}
    if(manifest.bytes!==header.bytes||manifest.chunks!==header.chunks||!Number.isInteger(header.chunks)||header.chunks<1||header.chunks>Math.ceil(this.maximum/CHUNK)||!Number.isSafeInteger(header.bytes)||header.bytes<1||header.bytes>this.maximum||offset>header.bytes)throw Error('Invalid encrypted content manifest or range')
    const output=new Uint8Array(Math.min(length,header.bytes-offset)),end=offset+output.length
    try{
      for(let index=Math.floor(offset/CHUNK);index*CHUNK<end;index++){
        const value=await this.blobs.get(keyFor(header.id,index));if(!value)throw Error('Encrypted content is incomplete')
        const bytes=await open(key,JSON.parse(value),header.id+':chunk:'+index)
        try{if(bytes.length!==Math.min(CHUNK,header.bytes-index*CHUNK))throw Error('Encrypted content length mismatch');const from=Math.max(0,offset-index*CHUNK),to=Math.min(bytes.length,end-index*CHUNK);output.set(bytes.subarray(from,to),index*CHUNK+from-offset)}finally{bytes.fill(0)}
      }
      await this.scopeKey(header.scope);return output
    }catch(error){output.fill(0);throw error}
  }
  async dataUrl(ref:string){const header=await this.header(ref);if(!header) return null;const info=await this.info(header);if(!Number.isSafeInteger(header.bytes)||header.bytes<1||header.bytes>this.maximum)throw new Error('Invalid encrypted content size')
    // Compatibility path for existing image consumers. Downloads/export use chunk iterators.
    const all=new Uint8Array(header.bytes);let offset=0;try{for await(const bytes of this.read(ref)){all.set(bytes,offset);offset+=bytes.length;bytes.fill(0)}return `data:${info.mime};base64,${encode64(all)}`}finally{all.fill(0)}
  }
  async rewrap(ref:string,scope:string){const header=await this.header(ref);if(!header||header.status!=='ready')throw new Error('Encrypted item not found');const raw=await open(await this.scopeKey(header.scope),header.key,`${header.id}:key:${header.scope}:${header.alias||''}`);try{const wrapped=await seal(await this.scopeKey(scope),raw,`${header.id}:key:${scope}:${header.alias||''}`);await this.index.put({...header,scope,key:wrapped})}finally{raw.fill(0)}}
  async remove(ref:string){const header=await this.header(ref);if(!header)return;await this.index.remove(header.id);for(let n=0;n<header.chunks;n++)await this.blobs.remove(keyFor(header.id,n))}
  async cleanupOrphans(){
    const live=new Set<string>();for await(const header of this.index.all()){if(header.status==='writing'&&header.createdAt<Date.now()-86400000)await this.index.remove(header.id);else live.add(header.id)}
    let removed=0;const keys=await this.blobs.keys(),expired=new Set<string>()
    for(const key of keys){const match=/^vault-backup-lease-([a-f0-9-]{36})$/.exec(key);if(!match)continue;try{const lease=JSON.parse(await this.blobs.get(key)||'null');if(Number.isFinite(lease?.updatedAt)&&lease.updatedAt<Date.now()-86400000)expired.add(match[1])}catch{/* Never remove unrecognized files. */}}
    for(const key of keys){const match=/^vault-v1-([a-f0-9-]{36})-chunk-\d+$/.exec(key),stage=/^vault-backup-stage-([a-f0-9-]{36})-\d+$/.exec(key);if(match&&!live.has(match[1])&&!await this.index.get(match[1])||stage&&expired.has(stage[1])){await this.blobs.remove(key);removed++}}
    for(const id of expired)await this.blobs.remove('vault-backup-lease-'+id)
    return removed
  }
}
export async function* responseBytes(response:Response,signal?:AbortSignal){const reader=response.body?.getReader();if(!reader)throw new Error('Empty media response');let completed=false;try{while(true){signal?.throwIfAborted();const next=await reader.read();if(next.done){completed=true;return}yield next.value}}finally{if(!completed)await reader.cancel().catch(()=>{});reader.releaseLock()}}
export async function* dataUrlBytes(url:string){const match=/^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(url);if(!match)throw new Error('Invalid local media data');const text=match[2].replace(/[\r\n]/g,'');for(let offset=0;offset<text.length;offset+=65536)yield decode64(text.slice(offset,offset+65536))}
