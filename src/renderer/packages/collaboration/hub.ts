import { z } from 'zod'
import { SharedHitlQueue,SharePermissionsSchema,HitlPolicySchema,SnapshotSchema,HitlRequestSchema,SharedAuthorSchema,defaultSharePermissions,type SharePermissions,type SharedAuthor,type SharedSnapshot,type HitlPolicy,type HitlInput,type HitlAnswer,type HitlRequest } from '@shared/collaboration'
import { b64,un64,encodeInvitation,makeInvitation,parseInvitation,keyPair,type Invitation } from './crypto'
import { connectRoom,deviceIdentity,type Transport,type Link } from './transport'

export interface CollaborationAdapter {
  snapshot(sessionId:string):Promise<SharedSnapshot>
  submit(sessionId:string,text:string,interact:boolean,author:SharedAuthor,authorization:{assert:()=>void;signal:AbortSignal}):Promise<void>
  file(sessionId:string,id:string):AsyncIterable<Uint8Array>
  clone(snapshot:SharedSnapshot,read:(id:string)=>AsyncIterable<Uint8Array>,signal:AbortSignal):Promise<string>
}
type Peer={author:SharedAuthor;approved:boolean;permissions:SharePermissions;link:Link;lastRequest:number;operation?:AbortController}
export interface HostShare {id:string;sessionId:string;title:string;code:string;permissions:SharePermissions;policy:HitlPolicy;peers:Map<string,Peer>;hitl:SharedHitlQueue;transport:Transport;error?:string;busy:boolean;transferring:Set<string>}
export interface GuestShare {id:string;code:string;name:string;status:'connecting'|'waiting'|'connected'|'disconnected';snapshot?:SharedSnapshot;permissions:SharePermissions;hitls:HitlRequest[];transport:Transport;link?:Link;error?:string;busy:boolean;pending:Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>;file?:{request:string;queue:(Uint8Array|null)[];wake?:()=>void;bytes:number;error?:Error}}
const Message=z.discriminatedUnion('type',[
 z.object({type:z.literal('join'),name:z.string().trim().min(1).max(60)}).strict(),
 z.object({type:z.literal('post'),id:z.string().uuid(),text:z.string().trim().min(1).max(100000),interact:z.boolean()}).strict(),
 z.object({type:z.literal('answer'),id:z.string().uuid(),answer:z.unknown()}).strict(),
 z.object({type:z.literal('file'),id:z.string().uuid(),file:z.string().max(400),clone:z.boolean()}).strict(),
 z.object({type:z.literal('cancel-file'),id:z.string().uuid()}).strict(),
 z.object({type:z.literal('file-ack'),id:z.string().uuid()}).strict(),
])
const Response=z.discriminatedUnion('type',[
 z.object({type:z.literal('waiting')}).strict(),
 z.object({type:z.literal('state'),snapshot:SnapshotSchema,permissions:SharePermissionsSchema,hitls:z.array(HitlRequestSchema).max(20),busy:z.boolean()}).strict(),
 z.object({type:z.literal('hitls'),hitls:z.array(HitlRequestSchema).max(20)}).strict(),
 z.object({type:z.literal('ack'),id:z.string().uuid()}).strict(),
 z.object({type:z.literal('error'),id:z.string().uuid().optional(),message:z.string().max(1000)}).strict(),
 z.object({type:z.literal('chunk'),id:z.string().uuid(),data:z.string().max(65536),done:z.boolean()}).strict(),
 z.object({type:z.literal('closed')}).strict(),
])
const messageError=(error:unknown)=>error instanceof Error?error.message:String(error)

/** Volatile rooms; the existing app database remains authoritative on the owner. */
export class CollaborationHub{
  hosts=new Map<string,HostShare>();guests=new Map<string,GuestShare>()
  private listeners=new Set<()=>void>();private version=0;private refreshes=new Map<string,Promise<void>>()
  private dirty=new Set<string>()
  private fileAcks=new Map<string,()=>void>()
  constructor(private adapter:CollaborationAdapter){}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  getVersion=()=>this.version
  changed=()=>{this.version++;for(const listener of this.listeners)listener()}
  shared(sessionId:string){return [...this.hosts.values()].find(room=>room.sessionId===sessionId)}
  async host(sessionId:string,policy:HitlPolicy='owner',permissions:SharePermissions=defaultSharePermissions,relay?:string){
    const existing=this.shared(sessionId);if(existing)return existing
    if(this.hosts.size>=8)throw Error('At most eight shared chats can be active')
    const snapshot=await this.adapter.snapshot(sessionId);const identity=await keyPair(),invite=makeInvitation(identity.publicKey)
    const room={} as HostShare
    Object.assign(room,{id:invite.room,sessionId,title:snapshot.title,code:encodeInvitation(invite),policy:HitlPolicySchema.parse(policy),permissions:SharePermissionsSchema.parse(permissions),peers:new Map(),busy:false,transferring:new Set()})
    room.hitl=new SharedHitlQueue(()=>room.policy,()=>new Set([...room.peers.values()].filter(peer=>peer.approved).map(peer=>peer.author.id)),()=>{this.changed();for(const peer of room.peers.values())if(peer.approved)void peer.link.send({type:'hitls',hitls:room.hitl.requests(peer.author.id)}).catch(()=>{})})
    room.transport=connectRoom(invite,identity,true,{message:(link,value)=>this.receiveHost(room,link,value),leave:id=>{room.peers.get(id)?.operation?.abort();room.peers.delete(id);room.hitl.revoke(id);this.changed()},error:error=>{room.error=messageError(error);this.changed()}},relay)
    this.hosts.set(room.id,room);this.changed();return room
  }
  async join(code:string,name:string,relay?:string){
    const invite=parseInvitation(code);if(this.hosts.has(invite.room))throw Error('This device owns this shared chat')
    const existing=this.guests.get(invite.room);if(existing)return existing
    if(this.guests.size>=8)throw Error('At most eight shared chats can be active')
    name=SharedAuthorSchema.shape.name.parse(name)
    const identity=await deviceIdentity(),guest={} as GuestShare
    Object.assign(guest,{id:invite.room,code:encodeInvitation(invite),name,status:'connecting',permissions:{...defaultSharePermissions},hitls:[],busy:false,pending:new Map()})
    guest.transport=connectRoom(invite,identity,false,{connected:link=>{void link.send({type:'join',name}).catch(error=>this.errorGuest(guest,error))},message:(link,value)=>{guest.link=link;this.receiveGuest(guest,value)},leave:()=>{guest.status='disconnected';guest.hitls=[];guest.snapshot=undefined;this.failPending(guest);this.changed()},error:error=>this.errorGuest(guest,error)},relay)
    this.guests.set(guest.id,guest);this.changed();return guest
  }
  private errorGuest(guest:GuestShare,error:unknown){guest.error=messageError(error);this.changed()}
  private failPending(guest:GuestShare){for(const item of guest.pending.values()){clearTimeout(item.timer);item.reject(Error('Shared chat disconnected'))}guest.pending.clear();if(guest.file){guest.file.error=Error('Shared chat disconnected');guest.file.wake?.()}}
  private async receiveHost(room:HostShare,link:Link,raw:unknown){
    if(!this.hosts.has(room.id))return
    const parsed=Message.safeParse(raw);if(!parsed.success)throw Error('Invalid shared chat request')
    const input=parsed.data
    if(input.type==='join'){
      if(room.peers.has(link.id))return
      room.peers.set(link.id,{author:{id:link.id,name:input.name},approved:false,permissions:{...room.permissions},link,lastRequest:0})
      await link.send({type:'waiting'});this.changed();return
    }
    const peer=room.peers.get(link.id);if(!peer?.approved)throw Error('The owner must admit this participant')
    try{
      if(input.type==='answer'){if(!room.hitl.accept(input.id,link.id,input.answer))throw Error('This question is closed or you cannot answer it');await link.send({type:'ack',id:input.id});return}
      if(input.type==='cancel-file'){room.transferring.delete(link.id+':'+input.id);this.fileAcks.get(link.id+':'+input.id)?.();return}
      if(input.type==='file-ack'){this.fileAcks.get(link.id+':'+input.id)?.();return}
      if(input.type==='file'){
        if(input.clone&&!peer.permissions.clone)throw Error('Cloning is not allowed')
        const key=link.id+':'+input.id;if([...room.transferring].some(value=>value.startsWith(link.id+':')))throw Error('A file transfer is already active')
        room.transferring.add(key)
        void this.sendFile(room,peer,input.id,input.file,key,input.clone).catch(error=>link.send({type:'error',id:input.id,message:messageError(error).slice(0,1000)})).catch(()=>{}).finally(()=>room.transferring.delete(key));return
      }
      if(!peer.permissions.write||input.interact&&!peer.permissions.interact)throw Error('The owner has not allowed this action')
      if(room.busy)throw Error('Another request is running. Wait for it to finish.')
      if(Date.now()-peer.lastRequest<1000)throw Error('Wait before sending another request')
      peer.lastRequest=Date.now();room.busy=true;peer.operation=new AbortController();this.changed()
      const authorization={signal:peer.operation.signal,assert:()=>{if(!this.hosts.has(room.id)||room.peers.get(link.id)!==peer||!peer.approved||!peer.permissions.write||input.interact&&!peer.permissions.interact)throw Error('Shared chat access was revoked')}}
      void this.adapter.submit(room.sessionId,input.text,input.interact,peer.author,authorization).then(()=>link.send({type:'ack',id:input.id})).catch(error=>link.send({type:'error',id:input.id,message:messageError(error).slice(0,1000)})).catch(()=>{}).finally(()=>{peer.operation=undefined;room.busy=false;void this.refresh(room.sessionId);this.changed()})
    }catch(error){await link.send({type:'error',...('id'in input?{id:input.id}:{}),message:messageError(error).slice(0,1000)})}
  }
  private async sendFile(room:HostShare,peer:Peer,request:string,id:string,key:string,clone:boolean){
    const check=()=>{if(!this.hosts.has(room.id)||!room.transferring.has(key)||room.peers.get(peer.author.id)!==peer||!peer.approved||clone&&!peer.permissions.clone)throw Error('File sharing was revoked')}
    let total=0
    for await(const bytes of this.adapter.file(room.sessionId,id)){
      try{for(let offset=0;offset<bytes.length;offset+=32768){check();const chunk=bytes.subarray(offset,offset+32768);total+=chunk.length;if(total>128*1024*1024)throw Error('File exceeds the transfer limit')
        let timer:ReturnType<typeof setTimeout>|undefined
        const ack=new Promise<void>((resolve,reject)=>{this.fileAcks.set(key,resolve);timer=setTimeout(()=>reject(Error('File receiver timed out')),30000)})
        try{await Promise.all([peer.link.send({type:'chunk',id:request,data:b64(chunk),done:false}),ack]);check()}finally{clearTimeout(timer);this.fileAcks.delete(key)}
      }}finally{bytes.fill(0)}
    }
    check();await peer.link.send({type:'chunk',id:request,data:'',done:true})
  }
  private receiveGuest(guest:GuestShare,raw:unknown){
    const input=Response.parse(raw)
    if(input.type==='waiting')guest.status='waiting'
    if(input.type==='state'){guest.snapshot=input.snapshot;guest.permissions=input.permissions;guest.hitls=input.hitls;guest.busy=input.busy;guest.status='connected';guest.error=undefined}
    if(input.type==='hitls')guest.hitls=input.hitls
    if(input.type==='closed'){this.stop(guest.id);return}
    if(input.type==='ack'||input.type==='error'){
      if(input.type==='error')guest.error=input.message
      if(input.id){const item=guest.pending.get(input.id);if(item){clearTimeout(item.timer);guest.pending.delete(input.id);input.type==='error'?item.reject(Error(input.message)):item.resolve(undefined)}
        if(input.type==='error'&&guest.file?.request===input.id){guest.file.error=Error(input.message);guest.file.wake?.()}}
    }
    if(input.type==='chunk'){
      const file=guest.file;if(!file||file.request!==input.id)return
      if(file.queue.length>=64)throw Error('File receiver is too slow')
      if(input.data){const bytes=un64(input.data);file.bytes+=bytes.length;if(file.bytes>128*1024*1024)throw Error('File exceeds the transfer limit');file.queue.push(bytes)}
      if(input.done)file.queue.push(null);file.wake?.()
    }
    this.changed()
  }
  async admit(id:string,actor:string,allow:boolean){const room=this.hosts.get(id),peer=room?.peers.get(actor);if(!room||!peer)return;if(!allow){this.revoke(id,actor);return}peer.approved=true;await this.refresh(room.sessionId);this.changed()}
  setPermissions(id:string,actor:string,permissions:SharePermissions){const room=this.hosts.get(id),peer=room?.peers.get(actor);if(!room||!peer)return;peer.permissions=SharePermissionsSchema.parse(permissions);peer.operation?.abort();room.hitl.revoke(actor);void this.refresh(room.sessionId);this.changed()}
  setPolicy(id:string,policy:HitlPolicy){const room=this.hosts.get(id);if(!room)return;room.hitl.cancel();room.policy=HitlPolicySchema.parse(policy);this.changed()}
  revoke(id:string,actor:string){const room=this.hosts.get(id),peer=room?.peers.get(actor);if(!room||!peer)return;peer.approved=false;peer.operation?.abort();room.peers.delete(actor);room.hitl.revoke(actor);void peer.link.send({type:'closed'}).catch(()=>{}).finally(()=>room.transport.remove(actor));this.changed()}
  refresh(sessionId:string):Promise<void>{
    const previous=this.refreshes.get(sessionId);if(previous){this.dirty.add(sessionId);return previous}
    const work=(async()=>{const room=this.shared(sessionId);if(!room)return;try{const snapshot=SnapshotSchema.parse(await this.adapter.snapshot(sessionId));room.title=snapshot.title;room.error=undefined;for(const peer of room.peers.values())if(peer.approved)await peer.link.send({type:'state',snapshot,permissions:peer.permissions,hitls:room.hitl.requests(peer.author.id),busy:room.busy})}catch(error){room.error=messageError(error);this.changed()}})().finally(()=>{this.refreshes.delete(sessionId);if(this.dirty.delete(sessionId))void this.refresh(sessionId)})
    this.refreshes.set(sessionId,work);return work
  }
  async post(id:string,text:string,interact:boolean){const guest=this.guests.get(id);if(!guest?.link||guest.status!=='connected'||!guest.permissions.write||interact&&!guest.permissions.interact)throw Error('This action is not allowed');const request=crypto.randomUUID();return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{guest.pending.delete(request);reject(Error('The owner has not completed this request. Check the conversation before retrying.'))},10*60*1000);guest.pending.set(request,{resolve,reject,timer});void guest.link!.send({type:'post',id:request,text,interact}).catch(error=>{clearTimeout(timer);guest.pending.delete(request);reject(error)})})}
  async answer(id:string,request:string,answer:HitlAnswer){const guest=this.guests.get(id);if(!guest?.link||!guest.hitls.some(item=>item.id===request))throw Error('This question is no longer available');if(guest.pending.has(request))throw Error('A response is already pending');return new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{guest.pending.delete(request);reject(Error('The owner did not confirm this response'))},30000);guest.pending.set(request,{resolve,reject,timer});void guest.link!.send({type:'answer',id:request,answer}).catch(error=>{clearTimeout(timer);guest.pending.delete(request);reject(error)})})}
  async *readFile(id:string,fileId:string,clone=false,signal?:AbortSignal):AsyncGenerator<Uint8Array>{
    const guest=this.guests.get(id);if(!guest?.link||guest.status!=='connected'||clone&&!guest.permissions.clone)throw Error('This action is not allowed');if(guest.file)throw Error('A file transfer is already active')
    const request=crypto.randomUUID(),file:NonNullable<GuestShare['file']>={request,queue:[],bytes:0};guest.file=file
    const abort=()=>{file.error=Error('File transfer cancelled');file.wake?.()};signal?.addEventListener('abort',abort,{once:true})
    let timer:ReturnType<typeof setTimeout>|undefined
    try{
      signal?.throwIfAborted();await guest.link.send({type:'file',id:request,file:fileId,clone})
      while(true){
        if(file.error)throw file.error;signal?.throwIfAborted()
        if(!file.queue.length){await new Promise<void>(resolve=>{file.wake=resolve;timer=setTimeout(()=>{file.error=Error('File transfer timed out');resolve()},30000)});clearTimeout(timer);file.wake=undefined;continue}
        const chunk=file.queue.shift()!;if(chunk===null)return;try{yield chunk}finally{chunk.fill(0);await guest.link.send({type:'file-ack',id:request})}
      }
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);guest.file=undefined;for(const chunk of file.queue)chunk?.fill(0);void guest.link.send({type:'cancel-file',id:request}).catch(()=>{})}
  }
  async clone(id:string,signal:AbortSignal){const guest=this.guests.get(id);if(!guest?.snapshot||!guest.permissions.clone)throw Error('Cloning is not allowed');if(guest.snapshot.truncated)throw Error('The full chat is not ready. Ask the owner to wait for generation to finish.');return this.adapter.clone(guest.snapshot,file=>this.readFile(id,file,true,signal),signal)}
  async decision<T>(sessionId:string,requester:string,input:HitlInput,local:(signal:AbortSignal)=>Promise<T>,encode:(value:T)=>HitlAnswer,decode:(answer:HitlAnswer)=>T,signal?:AbortSignal):Promise<T>{
    const room=this.shared(sessionId);if(!room)return requester==='owner'?local(signal||new AbortController().signal):decode(null)
    const controller=new AbortController();const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel()
    if(requester!=='owner'&&!room.peers.get(requester)?.approved){signal?.removeEventListener('abort',cancel);return decode(null)}
    const answer=room.hitl.ask(requester,input,controller.signal),request=room.hitl.requests('owner').at(-1);let chosen:T|undefined,localWon=false
    if(request&&request.requester===requester){void local(controller.signal).then(value=>{if(room.hitl.accept(request.id,'owner',encode(value))){chosen=value;localWon=true}}).catch(()=>room.hitl.accept(request.id,'owner',null))}
    try{const value=await answer;signal?.throwIfAborted();return localWon?chosen!:decode(value)}finally{controller.abort();signal?.removeEventListener('abort',cancel)}
  }
  stop(id:string){const host=this.hosts.get(id);if(host){this.hosts.delete(id);host.hitl.cancel();const goodbye=[...host.peers.values()].map(peer=>{peer.operation?.abort();return peer.link.send({type:'closed'})});const timeout=setTimeout(()=>host.transport.close(),2000);void Promise.allSettled(goodbye).then(()=>{clearTimeout(timeout);host.transport.close()});host.transferring.clear()}const guest=this.guests.get(id);if(guest){this.guests.delete(id);guest.transport.close();guest.snapshot=undefined;guest.hitls=[];this.failPending(guest)}this.changed()}
  stopAll(){for(const id of [...this.hosts.keys(),...this.guests.keys()])this.stop(id)}
}
