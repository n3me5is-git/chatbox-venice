const concat = (parts: ArrayLike<number>[]) => Buffer.concat(parts.map(part => Uint8Array.from(part)))
import { describe, expect, it, vi } from 'vitest'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, decryptChunk, deriveSigningAddressFromKey, encryptMessage, generateEphemeralKeyPair } from './crypto'
import { encryptConversation, secureVeniceChat } from './secure-chat'
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})
function fixture(options: {badNonce?:boolean;badSignature?:boolean;plaintext?:boolean;plainSignature?:boolean;wrongRequest?:boolean;gateway?:boolean;invalidSigner?:boolean;wrongReceipt?:boolean;wrongReportedSigner?:boolean}={}) {
 const enclave=generateEphemeralKeyPair(); const address=deriveSigningAddressFromKey(enclave.publicKeyHex)!
 const decrypted:string[]=[]; let sent=''
 const api=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{
  const target=new URL(String(url))
  if(target.pathname.endsWith('/tee/attestation')){
   const quote=Buffer.alloc(636);quote.writeUInt16LE(4,0);quote.writeUInt32LE(0x81,4);quote.set(Uint8Array.from(Buffer.from(address,'hex')),48+520)
   return json({verified:true,nonce:options.badNonce?'wrong':target.searchParams.get('nonce'),model:'secure-model',signing_key:enclave.publicKeyHex,signing_address:address,intel_quote:quote.toString('hex'),server_verification:{tdx:{valid:true},nonceBinding:{bound:true},verifiedAt:new Date().toISOString(),verificationDurationMs:1}})
  }
  if(target.pathname.endsWith('/chat/completions')){
   sent=String(init?.body);const request=JSON.parse(sent);decrypted.push(...request.messages.filter((m:{content:unknown})=>typeof m.content==='string'&&m.content.length>0).map((m:{content:string})=>decryptChunk(m.content,enclave.privateKey)))
   const client=new Headers(init?.headers).get('X-Venice-TEE-Client-Pub-Key')!
   return json({id:'reply-1',model:'secure-model',created:1,choices:[{index:0,message:{role:'assistant',content:options.plaintext?'Unencrypted':encryptMessage('Encrypted reply',client)},finish_reason:'stop'}]})
  }
  const hash=(text:string)=>bytesToHex(sha256(new TextEncoder().encode(text)));const text=options.plainSignature?'Encrypted reply':hash(options.wrongRequest?'Another request':sent)+':'+hash(options.badSignature?'Different reply':'Encrypted reply');const bytes=new TextEncoder().encode(text);const prefix=new TextEncoder().encode(`\x19Ethereum Signed Message:\n${bytes.length}`)
  const signedText=options.gateway?hash('gateway request')+':'+hash('gateway response'):text
  const signedBytes=new TextEncoder().encode(signedText),signedPrefix=new TextEncoder().encode(`\x19Ethereum Signed Message:\n${signedBytes.length}`)
  const signature=secp256k1.sign(keccak_256(Uint8Array.from(concat([signedPrefix,signedBytes]))),options.invalidSigner?generateEphemeralKeyPair().privateKey:enclave.privateKey)
  const [req,res]=signedText.split(':')
  return json({model:'secure-model',request_id:'reply-1',text:signedText,signature:'0x'+bytesToHex(signature.toBytes('compact'))+(27+signature.recovery).toString(16),...(options.gateway?{api_version:'aci/1',signing_algo:'ecdsa',signing_address:options.wrongReportedSigner?'0x'+'00'.repeat(20):'0x'+address,requested_request_id:'reply-1',receipt:{api_version:'aci/1',chat_id:options.wrongReceipt?'another-reply':'reply-1',endpoint:'/v1/chat/completions',event_log:[{type:'request.received',body_hash:'sha256:'+req},{type:'response.returned',body_hash:'sha256:'+res}]}}:{})})
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
 it.each([{badNonce:true},{badSignature:true},{plaintext:true},{plainSignature:true},{wrongRequest:true}])('fails closed without plaintext or billable retries: %j',async options=>{
  const f=fixture(options);await expect(secureVeniceChat(f.api as typeof fetch,'https://api.venice.ai/api/v1/chat/completions',{},body,'e2ee')).rejects.toThrow()
  expect(f.api.mock.calls.filter(([url])=>String(url).endsWith('/chat/completions')).length).toBe(options.badNonce?0:1)
 })
 it('blocks files and tool metadata instead of sending them outside encryption',()=>{
  const key=generateEphemeralKeyPair()
  expect(()=>encryptConversation([{role:'user',content:[{type:'image_url',image_url:{url:'private'}}]}],key.publicKeyHex)).toThrow('attachments')
  expect(()=>encryptConversation([{role:'assistant',content:'text',tool_calls:[{}]}],key.publicKeyHex)).toThrow('tool calls')
 })
 it.each([['private result body'],[''],[null],[[{type:'text',text:'private result body'}]]])('protects pending native tool bodies and preserves empty content: %j',async content=>{
  const f=fixture()
  const messages=[...body.messages,{role:'assistant',content:null,tool_calls:[{id:'pending-1',type:'function',function:{name:'local_echo',arguments:'{"text":"public argument"}'}}]},{role:'tool',name:'local_echo',tool_call_id:'pending-1',content}]
  const result=await secureVeniceChat(f.api as typeof fetch,'https://api.venice.ai/api/v1/chat/completions',{}, {...body,messages},'e2ee','native')
  const wire=JSON.parse(f.sent()),toolMessage=wire.messages.at(-1)
  expect(toolMessage).toMatchObject({role:'tool',name:'local_echo',tool_call_id:'pending-1'})
  expect(wire.messages.at(-2)).toMatchObject({role:'assistant',content:null,tool_calls:[{id:'pending-1',function:{name:'local_echo',arguments:'{"text":"public argument"}'}}]})
  expect(f.sent()).not.toContain('private result body')
  if(content){expect(toolMessage.content).toMatch(/^[0-9a-f]+$/i);expect(f.decrypted).toContain('private result body')}
  else expect(toolMessage.content).toBe(content)
  expect(await result.text()).toContain('Encrypted reply')
 })
 it('independently encrypts every result in a parallel native tool exchange',async()=>{
  const f=fixture(),calls=['one','two'].map(id=>({id,type:'function',function:{name:'local_echo',arguments:'{}'}}))
  const messages=[...body.messages,{role:'assistant',content:null,tool_calls:calls},...calls.map(call=>({role:'tool',tool_call_id:call.id,content:'same private result'}))]
  await secureVeniceChat(f.api as typeof fetch,'https://api.venice.ai/api/v1/chat/completions',{}, {...body,messages},'e2ee','native')
  const results=JSON.parse(f.sent()).messages.filter((message:{role:string})=>message.role==='tool')
  expect(results.map((message:{tool_call_id:string})=>message.tool_call_id)).toEqual(['one','two'])
  expect(results[0].content).not.toBe(results[1].content)
  expect(f.sent()).not.toContain('same private result')
  expect(f.decrypted.filter(value=>value==='same private result')).toHaveLength(2)
 })
 it('requires explicit compatibility for a valid attested gateway signature over transformed bytes',async()=>{
  const strict=fixture({gateway:true});await expect(secureVeniceChat(strict.api as typeof fetch,'https://api.venice.ai/api/v1/chat/completions',{},body,'e2ee')).rejects.toThrow('gateway hashes')
  const f=fixture({gateway:true});const result=await secureVeniceChat(f.api as typeof fetch,'https://api.venice.ai/api/v1/chat/completions',{},body,'e2ee',false,true)
  expect(await result.text()).toContain('Encrypted reply');expect(result.headers.get('X-Chatbox-Secure-Receipt')).toBe('gateway-signature-only');expect(f.sent()).not.toContain('Private')
 })
 it.each([{invalidSigner:true},{badNonce:true},{plaintext:true},{wrongReceipt:true},{wrongReportedSigner:true}])('does not bypass identity, encryption or receipt checks in compatibility mode: %j',async options=>{
  const f=fixture({...options,gateway:true});await expect(secureVeniceChat(f.api as typeof fetch,'https://api.venice.ai/api/v1/chat/completions',{},body,'e2ee','encrypted-text',true)).rejects.toThrow()
 })
})
