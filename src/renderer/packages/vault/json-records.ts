import type { EncryptedChunkStore } from './chunk-store'
/** Small sensitive records share the authenticated chunk format and portable backup. */
export class VaultJsonRecords {
  constructor(private readonly assets:EncryptedChunkStore,private readonly maximum=2*1024*1024){}
  async get<T>(alias:string):Promise<T|null>{const header=await this.assets.header(alias);if(!header)return null;if(header.bytes>this.maximum)throw new Error('Protected metadata exceeds the size limit');const data=new Uint8Array(header.bytes);let offset=0;try{for await(const bytes of this.assets.read(alias)){data.set(bytes,offset);offset+=bytes.length;bytes.fill(0)}return JSON.parse(new TextDecoder().decode(data)) as T}finally{data.fill(0)}}
  async prepare<T>(alias:string,value:T,scope:string){const previous=await this.assets.header(alias);const bytes=new TextEncoder().encode(JSON.stringify(value));let ref:string;try{if(bytes.length>this.maximum)throw new Error('Protected metadata exceeds the size limit');ref=await this.assets.put((async function*(){yield bytes})(),{name:'Protected metadata',mime:'application/json',kind:'chat',sourceId:alias},scope,alias)}finally{bytes.fill(0)}return {commit:async()=>{if(previous)await this.assets.remove(`vault-asset-${previous.id}`).catch(()=>{})},rollback:async()=>{if(previous)await this.assets.index.put(previous);await this.assets.remove(ref)}}}
  async set<T>(alias:string,value:T,scope:string){const transaction=await this.prepare(alias,value,scope);await transaction.commit()}
  remove(alias:string){return this.assets.remove(alias)}
}
