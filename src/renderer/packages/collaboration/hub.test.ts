import {afterEach,describe,expect,it,vi} from 'vitest'
import {keyPair} from './crypto'
import type {CollaborationAdapter} from './hub'
const network=vi.hoisted(()=>({rooms:new Map<string,any>(),index:0}))
vi.mock('./transport',()=>({
 deviceIdentity:()=>keyPair(),
 connectRoom:(invite:any,_identity:any,host:boolean,handlers:any)=>{
   if(host){const room={handlers,guests:new Map()};network.rooms.set(invite.room,room);return {close:()=>{for(const guest of room.guests.values() as Iterable<any>)guest.handlers.leave('owner');network.rooms.delete(invite.room)},remove:(id:string)=>room.guests.delete(id)}}
   const room=network.rooms.get(invite.room),id='guest-'+(++network.index),guest={handlers};room.guests.set(id,guest)
   const toHost={id:'owner',send:async(value:any)=>room.handlers.message({id,send:async(reply:any)=>handlers.message(toHost,reply)},value)}
   queueMicrotask(()=>handlers.connected(toHost))
   return {close:()=>{room.guests.delete(id);room.handlers.leave(id)},remove:()=>{}}
 },
}))
import {CollaborationHub} from './hub'
const hubs:CollaborationHub[]=[]
afterEach(()=>{for(const hub of hubs)hub.stopAll();hubs.length=0;network.rooms.clear()})
function setup(){
 const snapshot={title:'Shared test',messages:[{id:'m',role:'user' as const,text:'Hello'}],files:[{id:'f',name:'test.bin',path:'test.bin',mime:'application/octet-stream',bytes:100000}],truncated:false,revision:1}
 const submit=vi.fn(async()=>{}),clone=vi.fn(async()=> 'cloned-chat'),adapter:CollaborationAdapter={snapshot:async()=>structuredClone(snapshot),submit,clone,async *file(){yield new Uint8Array(100000).fill(42)}}
 const make=()=>{const hub=new CollaborationHub(adapter);hubs.push(hub);return hub};return {make,submit,clone,snapshot}
}
describe('host-authoritative collaboration',()=>{
 it('shares nothing before admission and rejects forged write and AI permissions on the host',async()=>{
   const {make,submit}=setup(),owner=make(),visitor=make(),host=await owner.host('chat'),guest=await visitor.join(host.code,'Alice')
   await vi.waitFor(()=>expect(guest.status).toBe('waiting'));expect(guest.snapshot).toBeUndefined();const actor=[...host.peers.keys()][0]
   await owner.admit(host.id,actor,true);expect(guest.snapshot?.title).toBe('Shared test')
   await guest.link!.send({type:'post',id:crypto.randomUUID(),text:'Forged',interact:true});expect(submit).not.toHaveBeenCalled();expect(guest.error).toContain('not allowed')
   owner.setPermissions(host.id,actor,{write:true,interact:false,clone:false});await owner.refresh('chat')
   await visitor.post(guest.id,'Human message',false);expect(submit).toHaveBeenCalledWith('chat','Human message',false,{id:actor,name:'Alice'},expect.objectContaining({assert:expect.any(Function)}))
   await expect(visitor.post(guest.id,'Use AI',true)).rejects.toThrow('not allowed')
   owner.revoke(host.id,actor);expect(visitor.guests.has(guest.id)).toBe(false)
 })
 it('routes questions to the requester and first-answer races to everyone',async()=>{
   const {make}=setup(),owner=make(),alice=make(),bob=make(),host=await owner.host('chat','requester'),a=await alice.join(host.code,'Alice'),b=await bob.join(host.code,'Bob')
   await vi.waitFor(()=>expect(host.peers.size).toBe(2));const [aid,bid]=[...host.peers.keys()];await owner.admit(host.id,aid,true);await owner.admit(host.id,bid,true)
   const input={kind:'confirm' as const,title:'Generate?',detail:'This costs money'},local=vi.fn(async()=>true)
   const first=owner.decision('chat',aid,input,local,value=>value,value=>value===true)
   await vi.waitFor(()=>expect(a.hitls.length).toBe(1));expect(b.hitls).toEqual([]);expect(local).not.toHaveBeenCalled()
   await alice.answer(a.id,a.hitls[0].id,true);expect(await first).toBe(true);expect(a.hitls).toEqual([])
   owner.setPolicy(host.id,'first')
   const second=owner.decision('chat',aid,input,()=>new Promise(()=>{}),value=>value as boolean,value=>value===true)
   await vi.waitFor(()=>expect(b.hitls.length).toBe(1));const request=b.hitls[0].id
   await bob.answer(b.id,request,false);expect(await second).toBe(false);expect(a.hitls).toEqual([])
   await expect(alice.answer(a.id,request,true)).rejects.toThrow('no longer available')
 })
 it('streams binary files with receiver acknowledgements and gates cloning separately',async()=>{
   const {make}=setup(),owner=make(),visitor=make(),host=await owner.host('chat'),guest=await visitor.join(host.code,'Alice');await vi.waitFor(()=>expect(host.peers.size).toBe(1));await owner.admit(host.id,[...host.peers.keys()][0],true)
   let count=0;for await(const bytes of visitor.readFile(guest.id,'f')){expect(bytes.every(value=>value===42)).toBe(true);count+=bytes.length}expect(count).toBe(100000)
   await expect(visitor.clone(guest.id,new AbortController().signal)).rejects.toThrow('not allowed')
   owner.stop(host.id);await vi.waitFor(()=>expect(visitor.guests.has(guest.id)).toBe(false))
 })
})
