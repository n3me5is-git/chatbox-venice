import { describe,expect,it,vi } from 'vitest'
import { tool } from 'ai'
import { z } from 'zod'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { sha256 } from '@noble/hashes/sha256'
import Venice from '../venice'
import { bytesToHex,decryptChunk,deriveSigningAddressFromKey,encryptMessage,generateEphemeralKeyPair } from './crypto'
import type { ModelDependencies } from '../../../../types/adapters'

function fixture({native=false,badSignature=false,weakToolSignature=false,capability=true}={}){
 const enclave=generateEphemeralKeyPair(),address=deriveSigningAddressFromKey(enclave.publicKeyHex)!
 const wires:string[]=[],decrypted:string[]=[],events:string[]=[]
 let sent='',raw='',plain='',hasNativeCalls=false
 const api=vi.fn(async(request:any)=>{
  const url=new URL(request.url)
  if(url.pathname.endsWith('/tee/attestation')){
   const quote=Buffer.alloc(636);quote.writeUInt16LE(4,0);quote.writeUInt32LE(0x81,4);quote.set(Buffer.from(address,'hex'),48+520)
   return Response.json({verified:true,nonce:url.searchParams.get('nonce'),model:'secure-model',signing_key:enclave.publicKeyHex,signing_address:address,intel_quote:quote.toString('hex'),server_verification:{tdx:{valid:true},nonceBinding:{bound:true},verifiedAt:new Date().toISOString(),verificationDurationMs:1}})
  }
  if(url.pathname.endsWith('/chat/completions')){
   sent=String(request.body);wires.push(sent);const body=JSON.parse(sent)
   for(const message of body.messages)decrypted.push(['user','system'].includes(message.role)?decryptChunk(message.content,enclave.privateKey):JSON.stringify(message))
   const client=new Headers(request.headers).get('X-Venice-TEE-Client-Pub-Key')!
   const first=wires.length===1
   hasNativeCalls=native&&first
   plain=first&&!native?'<tool_call>{"name":"local_echo","arguments":{"text":"private argument"}}</tool_call>':first?'':'Finished with the local result'
   const delta=hasNativeCalls?{tool_calls:[{index:0,id:'call-native',type:'function',function:{name:'local_echo',arguments:'{"text":"private argument"}'}}]}:{content:encryptMessage(plain,client)}
   raw=`data: ${JSON.stringify({id:'secure-'+wires.length,model:'secure-model',created:1,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({id:'secure-'+wires.length,model:'secure-model',created:1,choices:[{index:0,delta:{},finish_reason:hasNativeCalls?'tool_calls':'stop'}]})}\n\ndata: [DONE]\n\n`
   return new Response(raw,{headers:{'content-type':'text/event-stream'}})
  }
  if(url.pathname.endsWith('/tee/signature')){
   events.push('signature')
   const hash=(value:string)=>bytesToHex(sha256(new TextEncoder().encode(value)))
   const signed=hash(sent)+':'+hash(badSignature?'tampered':hasNativeCalls&&!weakToolSignature?raw:plain)
   const bytes=new TextEncoder().encode(signed),prefix=new TextEncoder().encode(`\x19Ethereum Signed Message:\n${bytes.length}`)
   const payload=new Uint8Array(prefix.length+bytes.length);payload.set(prefix);payload.set(bytes,prefix.length)
   const signature=secp256k1.sign(keccak_256(payload),enclave.privateKey)
   return Response.json({model:'secure-model',request_id:url.searchParams.get('request_id'),text:signed,signature:'0x'+bytesToHex(signature.toBytes('compact'))+(27+signature.recovery).toString(16)})
  }
  throw Error('Unexpected mock endpoint')
 })
 const dependencies={request:{apiRequest:api,fetchWithOptions:vi.fn()},storage:{saveImage:vi.fn(),getImage:vi.fn()},sentry:{captureException:vi.fn(),withScope:vi.fn()},getRemoteConfig:vi.fn(),platformType:'desktop'} as unknown as ModelDependencies
 const model=new Venice({apiKey:'synthetic',apiHost:'https://api.venice.ai/api/v1',model:{modelId:'secure-model',capabilities:['tool_use'],vendorMetadata:{privacy:'private',capabilities:{supportsTeeAttestation:true,supportsE2EE:true,supportsFunctionCalling:capability}}},venice:{textPrivacy:'e2ee',e2eeToolsEnabled:true,e2eeToolMode:native?'native':'encrypted-text'}},dependencies)
 const execute=vi.fn(async({text}:{text:string})=>{expect(events).toContain('signature');events.push('execute');return {result:'private tool result: '+text}})
 const tools={local_echo:tool({description:'Read a local value',inputSchema:z.object({text:z.string()}),execute})}
 const run=async()=>{const parts=[];for await(const part of model.chatStream([{role:'system',content:'private system'},{role:'user',content:'private question'}],{tools,maxSteps:3}))parts.push(part);return parts}
 return {model,execute,wires,decrypted,api,run,events}
}

describe('real SDK encrypted tool round trips with a simulated enclave',()=>{
 it('executes a local/MCP-shaped tool and re-encrypts its result, without exposing schemas or history',async()=>{
  const f=fixture();const parts=await f.run()
  expect(f.execute).toHaveBeenCalledTimes(1);expect(f.wires).toHaveLength(2)
  expect(f.wires.join('\n')).not.toMatch(/local_echo|private argument|private tool result|private system|private question/)
  expect(f.decrypted.join('\n')).toContain('private tool result')
  expect(parts.some(part=>part.type==='tool-result')).toBe(true)
  expect(parts.some(part=>part.type==='error')).toBe(false)
  expect(JSON.stringify(parts.filter(part=>part.type==='text-delta'))).toContain('Finished with the local result')
 })
 it('allows explicit native tools only with catalog support and a signature bound to their full response',async()=>{
  const f=fixture({native:true});const parts=await f.run()
  expect(f.execute).toHaveBeenCalledTimes(1);expect(f.wires).toHaveLength(2)
  expect(f.wires[0]).toContain('local_echo');expect(f.wires[1]).toContain('private tool result')
  expect(f.wires.join('\n')).not.toMatch(/private question|private system/)
  expect(parts.some(part=>part.type==='error')).toBe(false)
 })
 it.each([{badSignature:true},{native:true,weakToolSignature:true}])('never executes unauthenticated tool calls or retries in plaintext: %j',async options=>{
  const f=fixture(options);const parts=await f.run()
  expect(f.execute).not.toHaveBeenCalled();expect(f.wires).toHaveLength(1)
  expect(parts.some(part=>part.type==='error')).toBe(true)
 })
 it('requires the catalog capability for native mode while allowing the encrypted text protocol separately',()=>{
  expect(fixture({native:true,capability:false}).model.isSupportToolUse()).toBe(false)
  expect(fixture({capability:false}).model.isSupportToolUse()).toBe(true)
 })
})
