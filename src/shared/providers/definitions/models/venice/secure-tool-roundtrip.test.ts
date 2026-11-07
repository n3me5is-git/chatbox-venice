import { describe,expect,it,vi } from 'vitest'
import { tool } from 'ai'
import { z } from 'zod'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { sha256 } from '@noble/hashes/sha256'
import Venice from '../venice'
import { bytesToHex,decryptChunk,deriveSigningAddressFromKey,encryptMessage,generateEphemeralKeyPair,isHexEncrypted } from './crypto'
import type { ModelDependencies } from '../../../../types/adapters'

function fixture({native=false,badSignature=false,weakToolSignature=false,capability=true,gateway=false,invalidSigner=false,xml=false,textBridge=false,invalidArguments=false,providerTee=false,wrongModel=false,wrongReceipt=false}={}){
 const enclave=generateEphemeralKeyPair(),address=deriveSigningAddressFromKey(enclave.publicKeyHex)!
 const wires:string[]=[],decrypted:string[]=[],events:string[]=[]
 let sent='',raw='',plain='',hasNativeCalls=false
 const api=vi.fn(async(request:any)=>{
  const url=new URL(request.url)
  if(url.pathname.endsWith('/tee/attestation')){
   const quote=Buffer.alloc(636);quote.writeUInt16LE(4,0);quote.writeUInt32LE(0x81,4);quote.set(Buffer.from(address,'hex'),48+520)
   return Response.json({verified:true,nonce:url.searchParams.get('nonce'),model:'secure-model',...(providerTee?{tee_provider:'near-ai',upstream_model:'z-ai/glm-test'}:{}),signing_key:enclave.publicKeyHex,signing_address:address,intel_quote:quote.toString('hex'),server_verification:{tdx:{valid:true},nonceBinding:{bound:true},verifiedAt:new Date().toISOString(),verificationDurationMs:1}})
  }
  if(url.pathname.endsWith('/chat/completions')){
   sent=String(request.body);wires.push(sent);const body=JSON.parse(sent)
   for(const message of body.messages){
    if(message.role==='tool'&&message.content)expect(isHexEncrypted(message.content)).toBe(true)
    decrypted.push(typeof message.content==='string'&&isHexEncrypted(message.content)?decryptChunk(message.content,enclave.privateKey):JSON.stringify(message))
   }
   const client=new Headers(request.headers).get('X-Venice-TEE-Client-Pub-Key')!
   const first=wires.length===1
   hasNativeCalls=native&&first&&!textBridge
   const toolReply=xml?'<function_calls><invoke name="local_echo"><parameter name="text" type="string">private argument</parameter></invoke></function_calls>':'<tool_call>{"name":"local_echo","arguments":{"text":'+(invalidArguments?'42':'"private argument"')+'}}</tool_call>'
   plain=first&&(!native||textBridge)?toolReply:first?'private assistant commentary':'Finished with the local result'
   const delta=hasNativeCalls?{content:encryptMessage(plain,client),tool_calls:[{index:0,id:'call-native',type:'function',function:{name:'local_echo',arguments:'{"text":"private argument"}'}}]}:{content:encryptMessage(plain,client)}
   raw=`data: ${JSON.stringify({id:'secure-'+wires.length,model:'secure-model',created:1,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({id:'secure-'+wires.length,model:'secure-model',created:1,choices:[{index:0,delta:{},finish_reason:hasNativeCalls?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`
   return new Response(raw,{headers:{'content-type':'text/event-stream'}})
  }
  if(url.pathname.endsWith('/tee/signature')){
   events.push('signature')
   const hash=(value:string)=>bytesToHex(sha256(new TextEncoder().encode(value)))
   const signed=(providerTee?(wrongModel?'another/model':'z-ai/glm-test')+':':'')+(gateway?hash('gateway request '+wires.length)+':'+hash('gateway response '+wires.length):hash(sent)+':'+hash(badSignature?'tampered':hasNativeCalls&&!weakToolSignature?raw:plain))
   const bytes=new TextEncoder().encode(signed),prefix=new TextEncoder().encode(`\x19Ethereum Signed Message:\n${bytes.length}`)
   const payload=new Uint8Array(prefix.length+bytes.length);payload.set(prefix);payload.set(bytes,prefix.length)
   const signature=secp256k1.sign(keccak_256(payload),invalidSigner?generateEphemeralKeyPair().privateKey:enclave.privateKey)
   const [req,res]=signed.split(':');const id=url.searchParams.get('request_id')
   return Response.json({model:'secure-model',request_id:id,text:signed,signature:'0x'+bytesToHex(signature.toBytes('compact'))+(27+signature.recovery).toString(16),...(gateway?{api_version:'aci/1',signing_algo:'ecdsa',signing_address:'0x'+address,requested_request_id:id,receipt:{api_version:'aci/1',chat_id:id,endpoint:'/v1/chat/completions',event_log:[{type:'request.received',body_hash:'sha256:'+req},{type:'response.returned',wire_hash:'sha256:'+res}]}}:{}),...(providerTee?{tee_provider:'near-ai',upstream_model:'z-ai/glm-test',signature_kind:'provider_tee',signing_algo:'ecdsa',signing_address:'0x'+address,requested_request_id:wrongReceipt?'another-request':id}:{})})
  }
  throw Error('Unexpected mock endpoint')
 })
 const dependencies={request:{apiRequest:api,fetchWithOptions:vi.fn()},storage:{saveImage:vi.fn(),getImage:vi.fn()},sentry:{captureException:vi.fn(),withScope:vi.fn()},getRemoteConfig:vi.fn(),platformType:'desktop'} as unknown as ModelDependencies
 const model=new Venice({apiKey:'synthetic',apiHost:'https://api.venice.ai/api/v1',model:{modelId:'secure-model',capabilities:['tool_use'],vendorMetadata:{privacy:'private',capabilities:{supportsTeeAttestation:true,supportsE2EE:true,supportsFunctionCalling:capability}}},venice:{textPrivacy:'e2ee',e2eeToolsEnabled:true,e2eeToolMode:native?'native':'encrypted-text',secureReceiptCompatibility:gateway}},dependencies)
 const execute=vi.fn(async({text}:{text:string})=>{expect(events).toContain('signature');events.push('execute');return {result:'private tool result: '+text}})
 const tools={local_echo:tool({description:'Read a local value',inputSchema:z.object({text:z.string()}),execute})}
 const run=async()=>{const parts=[];for await(const part of model.chatStream([{role:'system',content:'private system'},{role:'user',content:'private question'}],{tools,maxSteps:3}))parts.push(part);return parts}
 return {model,execute,wires,decrypted,api,run,events}
}

describe('real SDK encrypted tool round trips with a simulated enclave',()=>{
 it('uses explicit gateway receipts for encrypted tool/result cycles while keeping schemas and results encrypted',async()=>{
  const f=fixture({gateway:true});const parts=await f.run();expect(f.execute).toHaveBeenCalledTimes(1);expect(f.wires).toHaveLength(2);expect(f.wires.join('\n')).not.toMatch(/local_echo|private argument|private tool result/);expect(parts.some(part=>part.type==='error')).toBe(false)
 })
 it('never dispatches a tool with an invalid attested signature even when compatibility is enabled',async()=>{
  const f=fixture({gateway:true,invalidSigner:true});await expect(f.run()).rejects.toThrow(/signature/);expect(f.execute).not.toHaveBeenCalled();expect(f.wires).toHaveLength(1)
 })
 it('executes a local/MCP-shaped tool and re-encrypts its result, without exposing schemas or history',async()=>{
  const f=fixture();const parts=await f.run()
  expect(f.execute).toHaveBeenCalledTimes(1);expect(f.wires).toHaveLength(2)
  expect(f.wires.join('\n')).not.toMatch(/local_echo|private argument|private tool result|private system|private question/)
  expect(f.decrypted.join('\n')).toContain('private tool result')
  expect(parts.some(part=>part.type==='tool-result')).toBe(true)
  expect(parts.some(part=>part.type==='error')).toBe(false)
  expect(JSON.stringify(parts.filter(part=>part.type==='text-delta'))).toContain('Finished with the local result')
 })
 it.each([false,true])('encrypts native tool results while preserving the public call envelope (gateway compatibility: %s)',async gateway=>{
  const f=fixture({native:true,gateway});const parts=await f.run()
  expect(f.execute).toHaveBeenCalledTimes(1);expect(f.wires).toHaveLength(2)
  expect(f.wires[0]).toContain('local_echo')
  expect(f.wires.join('\n')).not.toMatch(/private question|private system|private assistant commentary|private tool result/)
  const pending=JSON.parse(f.wires[1]).messages.slice(-2)
  expect(pending[0]).toMatchObject({role:'assistant',content:null,tool_calls:[{id:'call-native',function:{name:'local_echo',arguments:'{"text":"private argument"}'}}]})
  expect(pending[1]).toMatchObject({role:'tool',tool_call_id:'call-native'})
  expect(isHexEncrypted(pending[1].content)).toBe(true)
  expect(f.decrypted.join('\n')).toContain('private assistant commentary')
  expect(f.decrypted.join('\n')).toContain('private tool result: private argument')
  expect(parts.some(part=>part.type==='error')).toBe(false)
 })
 it.each([{badSignature:true},{native:true,weakToolSignature:true}])('never executes unauthenticated tool calls or retries in plaintext: %j',async options=>{
  const f=fixture(options);await expect(f.run()).rejects.toThrow(/signature|authenticated/)
  expect(f.execute).not.toHaveBeenCalled();expect(f.wires).toHaveLength(1)
 })
 it('requires the catalog capability for native mode while allowing the encrypted text protocol separately',()=>{
  expect(fixture({native:true,capability:false}).model.isSupportToolUse()).toBe(false)
  expect(fixture({capability:false}).model.isSupportToolUse()).toBe(true)
 })
 it.each([{xml:true},{native:true,textBridge:true},{native:true,textBridge:true,xml:true}])('executes verified GLM/gateway text calls with the real SDK: %j',async options=>{
  const f=fixture(options);const parts=await f.run()
  expect(f.execute).toHaveBeenCalledTimes(1);expect(f.wires).toHaveLength(2)
  expect(f.wires.join('\n')).not.toContain('private tool result')
  expect(f.decrypted.join('\n')).toContain('private tool result: private argument')
  expect(parts.some(part=>part.type==='error')).toBe(false)
 })
 it('checks the signature before parsing the native encrypted-text bridge',async()=>{
  const f=fixture({native:true,textBridge:true,xml:true,badSignature:true})
  await expect(f.run()).rejects.toThrow(/signature|authenticated/)
  expect(f.execute).not.toHaveBeenCalled();expect(f.wires).toHaveLength(1)
 })
 it('keeps SDK schema validation in front of the tool executor',async()=>{
  const f=fixture({native:true,textBridge:true,invalidArguments:true})
  await f.run().catch(()=>{})
  expect(f.execute).not.toHaveBeenCalled()
 })
 it.each([false,true])('uses the attested model key for NEAR provider_tee tool cycles (compatible: %s)',async gateway=>{
  const f=fixture({providerTee:true,gateway,xml:true});const parts=await f.run()
  expect(f.execute).toHaveBeenCalledTimes(1);expect(f.wires).toHaveLength(2)
  expect(parts.some(part=>part.type==='error')).toBe(false)
 })
 it.each([{wrongModel:true},{wrongReceipt:true},{invalidSigner:true}])('rejects mismatched NEAR provider_tee receipts before executing tools: %j',async options=>{
  const f=fixture({providerTee:true,gateway:true,xml:true,...options})
  await expect(f.run()).rejects.toThrow(/signature|authenticated|another request/)
  expect(f.execute).not.toHaveBeenCalled();expect(f.wires).toHaveLength(1)
 })
})
