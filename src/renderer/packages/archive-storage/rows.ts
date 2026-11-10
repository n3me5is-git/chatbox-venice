import type { SessionRowStorePort,SessionRowCommit,SessionRowSnapshot,SessionRowsDiff,SessionRowWriter } from '@chatbox/core/ports'
import { deriveMessageFacts } from '@chatbox/core/session/session-tree'
import type { MessageRow,SessionRecordV2,ThreadRow } from '@chatbox/core/session/session-tree'
import type { ArchiveEngine } from './engine'
type Guard=<T>(work:()=>Promise<T>)=>Promise<T>
async function serialMap<T,U>(items:readonly T[],map:(item:T)=>Promise<U>){const result:U[]=[];for(const item of items)result.push(await map(item));return result}
/** Keep the existing transactional row indexes, CAS, paging and token caches. Offload only payloads. */
export class ArchiveRows {
  onMutation=()=>{}
  writers=0;streams=0
  constructor(readonly backend:SessionRowStorePort,private readonly engine:ArchiveEngine,private readonly guard:Guard){}
  private async save(value:unknown,metadata:Record<string,unknown>={}){const key='payload:'+crypto.randomUUID();await this.engine.prepareValue(key,JSON.stringify(value));return {...metadata,__chatboxArchive:{key}}}
  async message(row:MessageRow):Promise<MessageRow>{const facts={...deriveMessageFacts(row.message),archivePayloadBytes:new TextEncoder().encode(JSON.stringify(row.message)).length};return {...row,facts,message:await this.save(row.message,{id:row.messageId,role:row.message.role,timestamp:row.message.timestamp,contentParts:[],__chatboxArchiveFacts:facts}) as unknown as MessageRow['message']}}
  async record(record:SessionRecordV2):Promise<SessionRecordV2>{const {id,activeThreadId,storageFormat,rowFormatVersion,rowAuthority,folderId,presentation,contextReadProjection,topologyFingerprint,forkCreatedAt}=record;return await this.save(record,{id,activeThreadId,storageFormat,rowFormatVersion,rowAuthority,folderId,presentation,contextReadProjection,topologyFingerprint,forkCreatedAt}) as unknown as SessionRecordV2}
  async thread(row:ThreadRow):Promise<ThreadRow>{return row.sessionPromptContextSnapshot?{...row,sessionPromptContextSnapshot:await this.save(row.sessionPromptContextSnapshot) as unknown as ThreadRow['sessionPromptContextSnapshot']}:row}
  async hydrate<T>(value:T):Promise<T>{
    if(!value||typeof value!=='object')return value
    if(value instanceof Uint8Array)return value
    if(Array.isArray(value)){const output=[];for(const item of value)output.push(await this.hydrate(item));return output as T}
    const source=value as Record<string,unknown>,pointer=(source.__chatboxArchive||(typeof source.taskId==='string'&&/^archive-payload:[a-f0-9-]{36}$/.test(source.taskId)?{key:'payload:'+source.taskId.slice(16)}:undefined)) as {key?:string}|undefined
    if(pointer){if(typeof pointer.key!=='string'||!/^payload:[a-f0-9-]{36}$/.test(pointer.key))throw new Error('Invalid archive payload reference');const text=await this.engine.get(pointer.key);if(text===null)throw new Error('Archive payload is missing');const restored=JSON.parse(text),{__chatboxArchive:_ref,__chatboxArchiveFacts:_facts,contentParts:_parts,...metadata}=source
      // Records retain the latest structural projections published by the row backend.
      return (source.storageFormat==='rows'?{...restored,...metadata}:restored) as T
    }
    const output:Record<string,unknown>={};for(const [key,item] of Object.entries(source))if(key!=='archivePayloadBytes')output[key]=await this.hydrate(item);return output as T
  }
  private async enabled(){return (await this.engine.state()).enabled===true}
  private async commit(commit:SessionRowCommit){return {...commit,record:await this.record(commit.record)}}
  private writer(writer:SessionRowWriter,record?:SessionRecordV2){const self=this;let disposed=false;self.writers++;return new Proxy(writer,{get(target,key){if(key==='record'&&record)return record;const original=Reflect.get(target,key);if(typeof original!=='function')return original;return (...args:any[])=>self.guard(async()=>{
    if(await self.enabled()){
      if(key==='appendMessage')args=[await self.message(args[0])]
      if(key==='appendThread')args=[await self.thread(args[0])]
      if(key==='appendRows')args=[await serialMap(args[0],async(row:any)=>row.kind==='message'?{...row,message:await self.message(row.message)}:{...row,thread:await self.thread(row.thread)}),...args.slice(1)]
    }
    try{const result=await self.hydrate(await original.apply(target,args));if(key==='publish'&&!disposed){disposed=true;self.writers--;self.onMutation()}return result}finally{if(key==='dispose'&&!disposed){disposed=true;self.writers--;self.onMutation()}}
  })}})}
  port():SessionRowStorePort {const self=this;return new Proxy(this.backend,{get(target,key){const original=Reflect.get(target,key);if(typeof original!=='function')return original
    if(key==='iterateRows')return async function*(request:any){self.streams++;try{await self.guard(async()=>{});for await(const row of original.call(target,request))yield await self.guard(()=>self.hydrate(row))}finally{self.streams--}}
    return (...args:any[])=>self.guard(async()=>{const enabled=await self.enabled(),inputRecord=key==='stageImportRows'?args[0]:undefined
      if(enabled){
        if(key==='writeRows'){const snapshot=args[0] as SessionRowSnapshot;args=[{...snapshot,record:await self.record(snapshot.record),rows:{...snapshot.rows,threads:await serialMap(snapshot.rows.threads,row=>self.thread(row)),messages:await serialMap(snapshot.rows.messages,row=>self.message(row))}},...args.slice(1)]}
        if(key==='applyDiff'){const diff=args[0] as SessionRowsDiff;args=[{...diff,threads:{...diff.threads,upsert:await serialMap(diff.threads.upsert,row=>self.thread(row))},messages:{...diff.messages,upsert:await serialMap(diff.messages.upsert,row=>self.message(row))}},await self.commit(args[1]),...args.slice(2)]}
        if(key==='stageRows')args=[await self.commit(args[0]),...args.slice(1)]
        if(key==='stageImportRows')args=[await self.record(args[0]),...args.slice(1)]
      }
      const result=await original.apply(target,args)
      if(['writeRows','applyDiff','deleteRows','disposeImportRows'].includes(String(key)))self.onMutation()
      return key==='stageRows'||key==='stageImportRows'?self.writer(result,inputRecord):self.hydrate(result)
    })
  }})}
  /** Stream one session at a time; no complete conversation/library snapshot in memory. */
  async prepare(){await this.backend.initialize();for(const id of await this.backend.listSessionIds()){
    const commit=await this.backend.readCommit(id);if(!commit)continue
    // Already offloaded sessions need no rewrite after an interrupted migration or a return to internal storage.
    if((commit.record as unknown as Record<string,unknown>).__chatboxArchive)continue
    const next={...commit,record:await this.record(commit.record),revision:commit.revision+1};const writer=await this.backend.stageRows(next,commit.revision)
    try{for await(const row of this.backend.iterateRows({sessionId:id,expectedRevision:commit.revision})){if(row.kind==='thread')await writer.appendThread(await this.thread(row.thread));else await writer.appendMessage(await this.message(row.message))}await writer.publish()}finally{await writer.dispose()}
  }}
}
