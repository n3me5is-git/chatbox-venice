import { z } from 'zod'
import vendor from './vendor/chic-transfer-vendor.js'
import { joinRoom, defaultRelayUrls } from './vendor/trystero026/nostr.mjs'
import { channel,connectionNonce,fingerprint,type Identity,type Invitation,type EncryptedFrame } from './crypto'
import { rtcConfiguration, type ConnectionOptions } from './network'

const Hello=z.object({type:z.literal('hello'),key:z.string().max(100),nonce:z.string().max(50)}).strict()
const Welcome=z.object({type:z.literal('welcome'),nonce:z.string().max(50)}).strict()
const Frame=z.object({type:z.literal('frame'),seq:z.number().int().positive(),data:z.string().max(1500000)}).strict()
const Fragment=z.object({fragment:z.string().uuid(),index:z.number().int().min(0),total:z.number().int().min(2).max(128),text:z.string().max(64000)}).strict()
export interface Link {id:string;send:(value:unknown)=>Promise<void>}
export interface Transport {close():void;remove(id:string):void}
/** The room password protects signaling. ECDH additionally authenticates the pinned owner. */
export function connectRoom(invite:Invitation,identity:Identity,host:boolean,handlers:{connected?:(link:Link)=>void;message:(link:Link,value:unknown)=>Promise<void>|void;leave:(id:string)=>void;error:(error:unknown)=>void},relay?:string,options?:ConnectionOptions):Transport{
  if(relay&&(!relay.startsWith('wss://')&&!/^ws:\/\/(127\.0\.0\.1|localhost):\d+$/.test(relay)||relay.length>300))throw Error('Use a secure wss:// signaling relay')
  let closed=false,ownerPeer:string|undefined
  const room=joinRoom({appId:'chatbox-venice-collaboration-v2',maxReceiveBytes:2097152,password:invite.secret,relayConfig:{urls:relay?[relay]:defaultRelayUrls.slice(0,5)},rtcConfig:rtcConfiguration(options)},invite.room,{onJoinError:(error:unknown)=>{if(!closed)handlers.error(error)}})
  const action=room.makeAction('cbsecure'),peers=new Map<string,{queue:Promise<void>;sendQueue:Promise<void>;secure?:Awaited<ReturnType<typeof channel>>;nonce:string;id?:string;authenticated?:boolean;fragments?:{id:string;total:number;parts:string[];deadline:number};timer:ReturnType<typeof setTimeout>}>()
  const pairingTimer=host?undefined:setTimeout(()=>{if(!closed&&!ownerPeer)handlers.error(Error('No response from the owner. Keep the owner’s app open, check that both devices use the same signaling relay, and retry pairing.'))},90000)
  const remove=(peer:string)=>{const state=peers.get(peer);if(state){clearTimeout(state.timer);peers.delete(peer);if(state.id&&state.authenticated)handlers.leave(state.id);if(ownerPeer===peer)ownerPeer=undefined}}
  const sendRaw=(peer:string,value:unknown)=>action.send(value,{target:peer}).then(()=>{})
  room.onPeerJoin=peer=>{
    if(closed||peers.size>=12)return
    const state={queue:Promise.resolve(),sendQueue:Promise.resolve(),nonce:connectionNonce(),timer:setTimeout(()=>{remove(peer);if(!closed&&!host&&!ownerPeer)handlers.error(Error('The secure pairing handshake timed out. Ask the owner to keep the app open and retry.'))},45000)}
    peers.set(peer,state)
    if(!host)void sendRaw(peer,{type:'hello',key:identity.publicKey,nonce:state.nonce}).catch(handlers.error)
  }
  room.onPeerLeave=remove
  action.onMessage=(raw,{peerId})=>{
    const state=peers.get(peerId);if(!state||closed)return
    state.queue=state.queue.then(async()=>{
      if(closed||peers.get(peerId)!==state||!host&&ownerPeer&&ownerPeer!==peerId)return
      const link=():Link=>({id:state.id!,send:value=>{
        const next=state.sendQueue.then(async()=>{
          const encoded=JSON.stringify(value);if(encoded.length>8000000)throw Error('Shared conversation exceeds the transfer limit')
          const send=async(value:unknown)=>{if(closed||peers.get(peerId)!==state)throw Error('Peer disconnected');await sendRaw(peerId,{type:'frame',...await state.secure!.seal(value)})}
          if(encoded.length<=64000)await send(value)
          else{const fragment=crypto.randomUUID(),total=Math.ceil(encoded.length/64000);for(let index=0;index<total;index++)await send({fragment,index,total,text:encoded.slice(index*64000,(index+1)*64000)})}
        })
        state.sendQueue=next.catch(()=>{});return next
      }})
      if(host&&Hello.safeParse(raw).success){
        if(state.secure)throw Error('Repeated peer handshake')
        const hello=Hello.parse(raw);state.id=await fingerprint(hello.key);state.secure=await channel(identity,hello.key,invite,hello.nonce,state.nonce,true)
        await sendRaw(peerId,{type:'welcome',nonce:state.nonce});return
      }
      if(!host&&Welcome.safeParse(raw).success){
        if(state.secure)throw Error('Repeated owner handshake')
        const welcome=Welcome.parse(raw);state.id='owner';state.secure=await channel(identity,invite.host,invite,state.nonce,welcome.nonce,false);handlers.connected?.(link())
      }else if(Frame.safeParse(raw).success){
        if(!state.secure||!state.id)throw Error('Peer is not authenticated')
        let value=await state.secure.open(raw as EncryptedFrame);clearTimeout(state.timer);state.authenticated=true;if(!host){ownerPeer=peerId;clearTimeout(pairingTimer)}
        if(Fragment.safeParse(value).success){
          const part=Fragment.parse(value)
          if(part.index===0){if(state.fragments)throw Error('Overlapping conversation transfer');state.fragments={id:part.fragment,total:part.total,parts:[],deadline:Date.now()+30000}}
          const fragments=state.fragments
          if(!fragments||fragments.id!==part.fragment||fragments.total!==part.total||fragments.parts.length!==part.index||Date.now()>fragments.deadline)throw Error('Invalid conversation transfer')
          fragments.parts.push(part.text);if(fragments.parts.length<fragments.total)return
          value=JSON.parse(fragments.parts.join(''));state.fragments=undefined
        }else if(state.fragments)throw Error('Interrupted conversation transfer')
        await handlers.message(link(),value)
      }
    }).catch(error=>{remove(peerId);handlers.error(error)})
  }
  return {close(){closed=true;clearTimeout(pairingTimer);for(const peer of [...peers.keys()])remove(peer);void room.leave()},remove(id){for(const [peer,state]of peers)if(state.id===id)remove(peer)}}
}

/** A stable non-extractable local key binds participant IDs to this browser installation. */
let identityPromise:Promise<Identity>|undefined
export function deviceIdentity():Promise<Identity>{return identityPromise ||= new Promise<Identity>((resolve,reject)=>{
  const open=indexedDB.open('chatbox-collaboration-identity',1)
  open.onupgradeneeded=()=>open.result.createObjectStore('identity')
  open.onerror=()=>reject(open.error)
  open.onsuccess=()=>{
    const db=open.result,request=db.transaction('identity').objectStore('identity').get('device')
    request.onerror=()=>{db.close();reject(request.error)}
    request.onsuccess=async()=>{try{
      if(request.result){resolve(request.result);db.close();return}
      const {keyPair}=await import('./crypto'),identity=await keyPair(),transaction=db.transaction('identity','readwrite');transaction.objectStore('identity').put(identity,'device')
      transaction.oncomplete=()=>{db.close();resolve(identity)};transaction.onerror=()=>{db.close();reject(transaction.error)}
    }catch(error){db.close();reject(error)}}
  }
}).catch(error=>{identityPromise=undefined;throw error})}

export function qrSvg(code:string){const Q=vendor.qrcodegen.QrCode,qr=Q.encodeText(code,Q.Ecc.MEDIUM),border=4,paths:string[]=[];for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))paths.push(`M${x+border},${y+border}h1v1h-1z`);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size+border*2} ${qr.size+border*2}"><rect width="100%" height="100%" fill="white"/><path d="${paths.join('')}" fill="black"/></svg>`}
export const scanQR=vendor.jsQR
