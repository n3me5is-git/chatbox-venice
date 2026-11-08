/** WebCrypto overlay pins the host in the invitation, even against another invitee. */
const encoder=new TextEncoder(),decoder=new TextDecoder()
export function b64(bytes:Uint8Array){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
export function un64(text:string){if(!/^[\w-]+$/.test(text)||text.length>2000000)throw Error('Invalid encrypted frame');return Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),value=>value.charCodeAt(0))}
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)))
export async function keyPair(){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);return {privateKey:pair.privateKey,publicKey:b64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)))}}
export type Identity=Awaited<ReturnType<typeof keyPair>>
export async function fingerprint(publicKey:string){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',un64(publicKey)))).slice(0,32)}
export interface Invitation{version:1;room:string;secret:string;host:string}
export function makeInvitation(host:string):Invitation{return {version:1,room:random(),secret:random(),host}}
export function encodeInvitation(invite:Invitation){return 'CB1.'+b64(encoder.encode(JSON.stringify(invite)))}
export function parseInvitation(input:string):Invitation{
  const code=input.trim().replace(/^.*#(CB1\.)/,'$1');if(!code.startsWith('CB1.')||code.length>700)throw Error('Invalid pairing code')
  const value=JSON.parse(decoder.decode(un64(code.slice(4))))
  if(value.version!==1||un64(value.room).length!==32||un64(value.secret).length!==32||un64(value.host).length!==65)throw Error('Invalid pairing code')
  return {version:1,room:value.room,secret:value.secret,host:value.host}
}
export const connectionNonce=random
export interface EncryptedFrame{seq:number;data:string}
export async function channel(identity:Identity,remote:string,invite:Invitation,clientNonce:string,hostNonce:string,host:boolean){
  if(un64(clientNonce).length!==32||un64(hostNonce).length!==32)throw Error('Invalid connection nonce')
  const pub=await crypto.subtle.importKey('raw',un64(remote),{name:'ECDH',namedCurve:'P-256'},false,[])
  const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:pub},identity.privateKey,256))
  let material:CryptoKey
  try{material=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveKey'])}finally{secret.fill(0)}
  const derive=(direction:string)=>crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:un64(invite.secret),info:encoder.encode(JSON.stringify(['chatbox-collaboration-v1',invite.room,clientNonce,hostNonce,direction]))},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])
  const [sendKey,receiveKey]=await Promise.all([derive(host?'host':'guest'),derive(host?'guest':'host')]);let sent=0,received=0
  const iv=(sequence:number)=>{const bytes=new Uint8Array(12);new DataView(bytes.buffer).setBigUint64(4,BigInt(sequence));return bytes}
  const aad=(sequence:number,fromHost:boolean)=>encoder.encode(invite.room+':'+(fromHost?'host':'guest')+':'+sequence)
  return {
    async seal(value:unknown):Promise<EncryptedFrame>{const bytes=encoder.encode(JSON.stringify(value));if(bytes.length>1024*1024)throw Error('Collaboration frame is too large');const seq=++sent;if(!Number.isSafeInteger(seq))throw Error('Connection exhausted');return {seq,data:b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:iv(seq),additionalData:aad(seq,host)},sendKey,bytes))) }},
    async open(frame:EncryptedFrame):Promise<unknown>{if(frame.seq!==received+1||frame.data.length>1500000)throw Error('Invalid or replayed collaboration frame');const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:iv(frame.seq),additionalData:aad(frame.seq,!host)},receiveKey,un64(frame.data));const value=JSON.parse(decoder.decode(bytes));received=frame.seq;return value},
  }
}
