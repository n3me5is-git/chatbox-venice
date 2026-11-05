import type { EncryptedChunkStore } from './chunk-store'
/** Small sensitive records share the authenticated chunk format and portable backup. */
export class VaultJsonRecords {
  constructor(private readonly assets:EncryptedChunkStore){}
  async get<T>(alias:string):Promise<T|null>{const header=await this.assets.header(alias);if(!header)return null;if(header.bytes>2*1024*1024)throw new Error('Protected metadata exceeds the size limit');const data=new Uint8Array(header.bytes);let offset=0;try{for await(const bytes of this.assets.read(alias)){data.set(bytes,offset);offset+=bytes.length;bytes.fill(0)}return JSON.parse(new TextDecoder().decode(data)) as T}finally{data.fill(0)}}
  async set<T>(alias:string,value:T,scope:string){const previous=await this.assets.header(alias);const bytes=new TextEncoder().encode(JSON.stringify(value));try{if(bytes.length>2*1024*1024)throw new Error('Protected metadata exceeds the size limit');await this.assets.put((async function*(){yield bytes})(),{name:'Protected metadata',mime:'application/json',kind:'chat',sourceId:alias},scope,alias)}finally{bytes.fill(0)}if(previous)await this.assets.remove(`vault-asset-${previous.id}`)}
  remove(alias:string){return this.assets.remove(alias)}
}
