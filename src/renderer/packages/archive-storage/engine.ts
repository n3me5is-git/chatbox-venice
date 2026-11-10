/** Relocatable ciphertext. Only this small catalog and device-wrapped key stay in the app profile. */
export interface ArchiveRef { id:string; root:string; parts:number; bytes:number; digest:string }
export interface ArchiveEntry { key:string; ref:ArchiveRef }
export interface ArchiveState { root:string; key?:string; enabled?:boolean; phase?:'preparing'|'copying'|'cleanup'; target?:string; previous?:string; completed?:number; total?:number }
export interface ArchiveCatalog {
  state():Promise<ArchiveState>; setState(state:ArchiveState):Promise<void>
  get(key:string):Promise<ArchiveEntry|undefined>; put(entry:ArchiveEntry):Promise<void>; remove(key:string):Promise<void>
  entries():Promise<ArchiveEntry[]>; publish(entries:ArchiveEntry[],state:ArchiveState):Promise<void>
}
export interface ArchiveDisk { read(root:string,name:string):Promise<string|null>; write(root:string,name:string,value:string):Promise<void>; remove(root:string,name:string):Promise<void>; check(root:string):Promise<void> }
export interface ArchiveKey { protect(value:string):Promise<string>; unprotect(value:string):Promise<string> }
export interface ArchiveLegacySource {key:string;read:()=>Promise<string|null>}
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true}),PART=192*1024
const base64=(bytes:Uint8Array)=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value)}
const unbase64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0))
const digest=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),x=>x.toString(16).padStart(2,'0')).join('')
export class ArchiveUnavailable extends Error { constructor(){super('Archive storage is unavailable. Reconnect the selected card or folder and restore access.')} }
export class ArchiveBusy extends Error { constructor(){super('Archive migration is in progress. Wait before changing or opening content.')} }
export class ArchiveEngine {
  private cryptoKey?:Promise<CryptoKey>
  private tail:Promise<unknown>=Promise.resolve()
  onChange=()=>{}
  removeLegacy:(key:string)=>Promise<void>=async()=>{throw new Error('Legacy archive cleanup is unavailable')}
  constructor(readonly catalog:ArchiveCatalog,readonly disk:ArchiveDisk,private readonly protector:ArchiveKey){}
  private serial<T>(work:()=>Promise<T>):Promise<T>{const result=this.tail.then(work);this.tail=result.catch(()=>{});return result}
  async state(){return this.catalog.state()}
  async ready(){const state=await this.state();if(state.phase==='preparing'||state.phase==='copying')throw new ArchiveBusy();try{await this.disk.check(state.root)}catch{this.onChange();throw new ArchiveUnavailable()}}
  private key(){return this.cryptoKey ||= (async()=>{const state=await this.state();let raw:Uint8Array|undefined
    try{if(state.key)raw=unbase64(await this.protector.unprotect(state.key))
      else{if((await this.catalog.entries()).length)throw new Error('The archive device key is missing');raw=crypto.getRandomValues(new Uint8Array(32));await this.catalog.setState({...state,key:await this.protector.protect(base64(raw))})}
      if(raw.length!==32)throw new Error('The archive device key is invalid');return await crypto.subtle.importKey('raw',raw as BufferSource,'AES-GCM',false,['encrypt','decrypt'])
    }finally{raw?.fill(0)}
  })().catch(error=>{this.cryptoKey=undefined;throw error})}
  private name(ref:ArchiveRef,part:number){return `a1-${ref.id}-${part}.bin`}
  private aad(key:string,ref:ArchiveRef,part:number){return encoder.encode(JSON.stringify(['chatbox-archive',1,key,ref.id,part,ref.parts,ref.bytes,ref.digest]))}
  async readRef(key:string,ref:ArchiveRef):Promise<string>{
    await this.disk.check(ref.root);const output=new Uint8Array(ref.bytes)
    try{for(let i=0,offset=0;i<ref.parts;i++){const value=await this.disk.read(ref.root,this.name(ref,i));if(value===null)throw new ArchiveUnavailable();const envelope=JSON.parse(value)
      if(envelope.v!==1||typeof envelope.iv!=='string'||typeof envelope.data!=='string')throw new Error('Invalid encrypted archive block')
      const bytes=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(envelope.iv) as BufferSource,additionalData:this.aad(key,ref,i)},await this.key(),unbase64(envelope.data) as BufferSource))
      if(bytes.length!==Math.min(PART,ref.bytes-offset))throw new Error('Encrypted archive block length mismatch');output.set(bytes,offset);offset+=bytes.length;bytes.fill(0)
    }if(await digest(output)!==ref.digest)throw new Error('Encrypted archive checksum mismatch');return decoder.decode(output)}finally{output.fill(0)}
  }
  async writeRef(key:string,value:string,root:string):Promise<ArchiveRef>{
    await this.disk.check(root);const bytes=encoder.encode(value),ref:ArchiveRef={id:crypto.randomUUID(),root,parts:Math.max(1,Math.ceil(bytes.length/PART)),bytes:bytes.length,digest:await digest(bytes)}
    try{for(let i=0;i<ref.parts;i++){const iv=crypto.getRandomValues(new Uint8Array(12)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:this.aad(key,ref,i)},await this.key(),bytes.subarray(i*PART,(i+1)*PART)))
      await this.disk.write(root,this.name(ref,i),JSON.stringify({v:1,iv:base64(iv),data:base64(data)}));data.fill(0)
    }if(await this.readRef(key,ref)!==value)throw new Error('Archive verification failed');return ref}catch(error){await this.erase(ref).catch(()=>{});throw error}finally{bytes.fill(0)}
  }
  async erase(ref:ArchiveRef){for(let i=0;i<ref.parts;i++)await this.disk.remove(ref.root,this.name(ref,i))}
  async get(key:string){const entry=await this.catalog.get(key);return entry?this.readRef(key,entry.ref):null}
  put(key:string,value:string,root?:string){return this.serial(async()=>{const previous=await this.catalog.get(key),ref=await this.writeRef(key,value,root??(await this.state()).root);await this.catalog.put({key,ref});if(previous)await this.erase(previous.ref).catch(()=>{});return ref})}
  remove(key:string){return this.serial(async()=>{const previous=await this.catalog.get(key);if(previous){await this.erase(previous.ref);await this.catalog.remove(key)}})}
  /** Old entries remain authoritative until every destination block has been read back and authenticated. */
  migrate(target:string,prepare:()=>Promise<ArchiveLegacySource[]|void>){return this.serial(async()=>{
    let state=await this.state();if(state.phase)throw new ArchiveBusy();if(state.root===target)return;await this.disk.check(state.root);await this.disk.check(target)
    state={...state,phase:'preparing',target,completed:0,total:0};await this.catalog.setState(state);this.onChange()
    const copies:ArchiveEntry[]=[]
    try{await this.key();const legacy=(await prepare())||[];state={...await this.state(),phase:'copying'};const entries=(await this.catalog.entries()).filter(e=>!e.key.startsWith('__'));const existing=new Set(entries.map(e=>e.key));state.total=entries.length+legacy.filter(item=>!existing.has(item.key)).length;await this.catalog.setState(state)
      const copy=async(key:string,value:string)=>{const entry={key,ref:await this.writeRef(key,value,target)};copies.push(entry);await this.catalog.put({key:'__pending__:'+key,ref:entry.ref});state.completed=copies.length;await this.catalog.setState(state);this.onChange()}
      for(const entry of entries)await copy(entry.key,await this.readRef(entry.key,entry.ref))
      // Large legacy blobs go directly from the original backend to the destination. No second internal copy is needed.
      for(const item of legacy)if(!existing.has(item.key)){const value=await item.read();if(value===null)throw new Error('A source archive item changed during migration');await copy(item.key,value);existing.add(item.key)}
      await this.disk.check(target);const cleanup:ArchiveEntry={key:'__migration-cleanup__',ref:await this.writeRef('__migration-cleanup__',JSON.stringify({entries,legacy:legacy.map(item=>item.key)}),target)}
      await this.catalog.publish([...copies,cleanup],{root:target,key:state.key,enabled:true,phase:'cleanup',previous:state.root,completed:copies.length,total:copies.length});for(const entry of copies)await this.catalog.remove('__pending__:'+entry.key);this.onChange()
    }catch(error){const current=await this.state();if(current.root!==state.root)throw error;for(const entry of copies){await this.erase(entry.ref).catch(()=>{});await this.catalog.remove('__pending__:'+entry.key)}await this.catalog.setState({root:current.root,key:current.key,enabled:current.enabled});this.onChange();throw error}
    await this.cleanup();this.onChange()
  })}
  /** Preparation uses this bypass while the public data ports are frozen. */
  async prepareValue(key:string,value:string){if(await this.catalog.get(key))return;const ref=await this.writeRef(key,value,(await this.state()).root);await this.catalog.put({key,ref})}
  async cleanup(leavePrevious=false){const state=await this.state();if(state.phase!=='cleanup')return
    await this.disk.check(state.root)
    if(!leavePrevious){
    const value=await this.get('__migration-cleanup__');if(!value)throw new Error('Archive cleanup journal is missing')
    const plan=JSON.parse(value) as ArchiveEntry[]|{entries:ArchiveEntry[];legacy:string[]};const entries=Array.isArray(plan)?plan:plan.entries
    for(const entry of entries)await this.erase(entry.ref)
    if(!Array.isArray(plan))for(const key of plan.legacy)await this.removeLegacy(key)
    }
    const journal=await this.catalog.get('__migration-cleanup__');for(const entry of await this.catalog.entries())if(entry.key.startsWith('__pending__:'))await this.catalog.remove(entry.key);await this.catalog.setState({root:state.root,key:state.key,enabled:state.enabled});await this.catalog.remove('__migration-cleanup__');if(journal)await this.erase(journal.ref)
  }
  /** An interrupted pre-commit copy did not publish its destination; safely retain its source. */
  async recover(){const state=await this.state();if(state.phase==='preparing'||state.phase==='copying'){for(const entry of await this.catalog.entries())if(entry.key.startsWith('__pending__:')){try{await this.erase(entry.ref);await this.catalog.remove(entry.key)}catch{ /* Source remains authoritative; retain unreachable cleanup metadata. */ }}await this.catalog.setState({root:state.root,key:state.key,enabled:state.enabled});this.onChange()}else if(state.phase==='cleanup')await this.cleanup()}
}
