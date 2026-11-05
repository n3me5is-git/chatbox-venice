import { aesKey, decode64, encode64, open, seal, type SealedBytes } from './crypto'
export type AssetInfo={name:string;mime:string;kind:'image'|'audio'|'video'|'document'|'chat'|'thumbnail';prompt?:string;model?:string;sourceId?:string}
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
      if(filled)await flush();signal?.throwIfAborted();header.manifest=await seal(key,new TextEncoder().encode(JSON.stringify({bytes:header.bytes,chunks:header.chunks})),`${id}:manifest`);header.status='ready';await this.index.put(header)
      return `vault-asset-${id}`
    }catch(error){await this.index.remove(id).catch(()=>{});for(let n=0;n<header.chunks;n++)await this.blobs.remove(keyFor(id,n)).catch(()=>{});throw error}finally{buffer.fill(0)}
  }
  async header(ref:string) {return ref.startsWith('vault-asset-')?this.index.get(ref.slice(12)):this.index.byAlias(ref)}
  private async dataKey(header:AssetHeader){checkId(header.id);const raw=await open(await this.scopeKey(header.scope),header.key,`${header.id}:key:${header.scope}:${header.alias||''}`);try{if(raw.length!==32)throw new Error('Invalid encrypted content key');return await aesKey(raw)}finally{raw.fill(0)}}
  async info(header:AssetHeader):Promise<AssetInfo>{const bytes=await open(await this.dataKey(header),header.info,`${header.id}:info`);try{return JSON.parse(new TextDecoder().decode(bytes)) as AssetInfo}finally{bytes.fill(0)}}
  async *read(ref:string):AsyncGenerator<Uint8Array> {
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
      yield bytes
    }
    if(total!==header.bytes)throw new Error('Encrypted content was truncated')
  }
  async dataUrl(ref:string){const header=await this.header(ref);if(!header) return null;const info=await this.info(header);const chunks:Uint8Array[]=[];for await(const bytes of this.read(ref))chunks.push(bytes)
    // Each chunk has independent padding; combine the decoded bytes only for legacy callers.
    const all=new Uint8Array(header.bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}try{return `data:${info.mime};base64,${encode64(all)}`}finally{all.fill(0);for(const bytes of chunks)bytes.fill(0)}
  }
  async rewrap(ref:string,scope:string){const header=await this.header(ref);if(!header||header.status!=='ready')throw new Error('Encrypted item not found');const raw=await open(await this.scopeKey(header.scope),header.key,`${header.id}:key:${header.scope}:${header.alias||''}`);try{const wrapped=await seal(await this.scopeKey(scope),raw,`${header.id}:key:${scope}:${header.alias||''}`);await this.index.put({...header,scope,key:wrapped})}finally{raw.fill(0)}}
  async remove(ref:string){const header=await this.header(ref);if(!header)return;await this.index.remove(header.id);for(let n=0;n<header.chunks;n++)await this.blobs.remove(keyFor(header.id,n))}
  async cleanupOrphans(){const live=new Set<string>();for await(const header of this.index.all()){if(header.status==='writing'&&header.createdAt<Date.now()-86400000)await this.index.remove(header.id);else live.add(header.id)}let removed=0;for(const key of await this.blobs.keys()){const match=/^vault-v1-([a-f0-9-]{36})-chunk-\d+$/.exec(key);if(match&&!live.has(match[1])&&!await this.index.get(match[1])){await this.blobs.remove(key);removed++}}return removed}
}
export async function* responseBytes(response:Response,signal?:AbortSignal){const reader=response.body?.getReader();if(!reader)throw new Error('Empty media response');let completed=false;try{while(true){signal?.throwIfAborted();const next=await reader.read();if(next.done){completed=true;return}yield next.value}}finally{if(!completed)await reader.cancel().catch(()=>{});reader.releaseLock()}}
export async function* dataUrlBytes(url:string){const match=/^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(url);if(!match)throw new Error('Invalid local media data');const text=match[2].replace(/[\r\n]/g,'');for(let offset=0;offset<text.length;offset+=65536)yield decode64(text.slice(offset,offset+65536))}
