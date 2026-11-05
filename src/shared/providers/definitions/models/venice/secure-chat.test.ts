import { describe, expect, it, vi } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex, decryptChunk, deriveSigningAddressFromKey, encryptMessage, generateEphemeralKeyPair } from './crypto'
import { encryptConversation, secureVeniceChat } from './secure-chat'
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})
function fixture(options: {badNonce?:boolean;badSignature?:boolean;plaintext?:boolean}={}) {
 const enclave=generateEphemeralKeyPair(); const address=deriveSigningAddressFromKey(enclave.publicKeyHex)!
 const decrypted:string[]=[]; let sent=''
 const api=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
  const target=new URL(String(url))
  if(target.pathname.endsWith('/tee/attestation')){
   const quote=Buffer.alloc(636);quote.writeUInt16LE(4,0);quote.writeUInt32LE(0x81,4);Buffer.from(address,'hex').copy(quote,48+520)
   return json({verified:true,nonce:options.badNonce?'wrong':target.searchParams.get('nonce'),model:'secure-model',signing_key:enclave.publicKeyHex,signing_address:address,intel_quote:quote.toString('hex'),server_verification:{tdx:{valid:true},nonceBinding:{bound:true},verifiedAt:new Date().toISOString(),verificationDurationMs:1}})
  }
  if(target.pathname.endsWith('/chat/completions')){
   sent=String(init?.body);const request=JSON.parse(sent);decrypted.push(...request.messages.map((m:{content:string})=>decryptChunk(m.content,enclave.privateKey)))
   const client=new Headers(init?.headers).get('X-Venice-TEE-Client-Pub-Key')!
   return json({id:'reply-1',model:'secure-model',created:1,choices:[{index:0,message:{role:'assistant',content:options.plaintext?'Unencrypted':encryptMessage('Encrypted reply',client)},finish_reason:'stop'}]})
  }
  const text=options.badSignature?'Different reply':'Encrypted reply';const bytes=new TextEncoder().encode(text);const prefix=new TextEncoder().encode(`\x19Ethereum Signed Message:\n${bytes.length}`)
  const signature=secp256k1.sign(keccak_256(Buffer.concat([prefix,bytes])),enclave.privateKey)
  return json({model:'secure-model',request_id:'reply-1',text,signature:'0x'+bytesToHex(signature.toBytes('compact'))+(27+signature.recovery).toString(16)})
 })
 return {api,decrypted,sent:()=>sent,enclave}
}
describe('Venice encrypted text transport (simulated enclave)',()=>{
 const body={model:'secure-model',messages:[{role:'system',content:'Private instructions'},{role:'user',content:'Private first message'},{role:'assistant',content:'Private old answer'},{role:'user',content:'Private second message'}]}
 it('encrypts every part of multi-turn history, strips search, decrypts and verifies before returning output',async()=>{
  const f=fixture();const result=await secureVeniceChat(f.api as typeof fetch,'https://api.venice.ai/api/v1/chat/completions',{},body,'e2ee')
  expect(f.sent()).not.toContain('Private');expect(f.decrypted.join('\n')).toContain('Private old answer')
  expect(JSON.parse(f.sent()).venice_parameters).toMatchObject({enable_e2ee:true,enable_web_search:'off',include_venice_system_prompt:false})
  expect(await result.text()).toContain('Encrypted reply');expect(f.api).toHaveBeenCalledTimes(3)
 })
 it.each([{badNonce:true},{badSignature:true},{plaintext:true}])('fails closed without plaintext or billable retries: %j',async options=>{
  const f=fixture(options);await expect(secureVeniceChat(f.api as typeof fetch,'https://api.venice.ai/api/v1/chat/completions',{},body,'e2ee')).rejects.toThrow()
  expect(f.api.mock.calls.filter(([url])=>String(url).endsWith('/chat/completions')).length).toBe(options.badNonce?0:1)
 })
 it('blocks files and tool metadata instead of sending them outside encryption',()=>{
  const key=generateEphemeralKeyPair()
  expect(()=>encryptConversation([{role:'user',content:[{type:'image_url',image_url:{url:'private'}}]}],key.publicKeyHex)).toThrow('attachments')
  expect(()=>encryptConversation([{role:'assistant',content:'text',tool_calls:[{}]}],key.publicKeyHex)).toThrow('tool calls')
 })
})
