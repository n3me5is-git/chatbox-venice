export type SealedBytes = { iv:string; data:string }
export function encode64(bytes:Uint8Array) { let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text) }
export function decode64(text:string) { const raw=atob(text);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes }
export const aesKey=(bytes:Uint8Array,extractable=false)=>crypto.subtle.importKey('raw',Uint8Array.from(bytes),{name:'AES-GCM'},extractable,['encrypt','decrypt'])
export async function seal(key:CryptoKey,bytes:Uint8Array,aad:string):Promise<SealedBytes> {
  const iv=crypto.getRandomValues(new Uint8Array(12))
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad),tagLength:128},key,Uint8Array.from(bytes))
  return {iv:encode64(iv),data:encode64(new Uint8Array(encrypted))}
}
export async function open(key:CryptoKey,value:SealedBytes,aad:string) {
  const iv=decode64(value.iv);if(iv.length!==12)throw new Error('Invalid encrypted record')
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad),tagLength:128},key,decode64(value.data)))
}
export async function pinKey(pin:string,salt:Uint8Array) {
  const bytes=new TextEncoder().encode(pin)
  try{const material=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);return await crypto.subtle.deriveKey({name:'PBKDF2',salt:Uint8Array.from(salt),iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}finally{bytes.fill(0)}
}
