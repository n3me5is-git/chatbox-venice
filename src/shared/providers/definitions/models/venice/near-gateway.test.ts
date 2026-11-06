import {expect,it,vi} from 'vitest'
import {nearGatewaySigningAddress} from './near-gateway'
const address='12'.repeat(20)
function fixture(options:{wrongNonce?:boolean;wrongKey?:boolean;debug?:boolean;status?:string}={}){
 const verify=vi.fn().mockResolvedValue({status:options.status||'UpToDate'})
 const fetch=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{expect(new Headers(init?.headers).has('Authorization')).toBe(false);const nonce=new URL(String(url)).searchParams.get('nonce')!;const bytes=Buffer.alloc(636+70);bytes.writeUInt16LE(4,0);bytes.writeUInt32LE(0x81,4);if(options.debug)bytes[168]=1;bytes.set(Buffer.from(options.wrongKey?'34'.repeat(20):address,'hex'),568);bytes.set(Buffer.from(nonce,'hex'),600);return Response.json({gateway_attestation:{signing_algo:'ecdsa',signing_address:'0x'+address,request_nonce:options.wrongNonce?'wrong':nonce,intel_quote:bytes.toString('hex')}})})
 return {fetch,verify}
}
it('verifies the fresh gateway quote separately without transmitting the Venice API key',async()=>{const f=fixture();expect(await nearGatewaySigningAddress(f.fetch as typeof fetch,'deepseek-ai/DeepSeek-V4-Flash','0x'+address,undefined,f.verify)).toBe(address);expect(f.verify).toHaveBeenCalledWith(expect.any(Uint8Array));expect(f.verify.mock.calls[0][0].length).toBe(636)})
it.each([{wrongNonce:true},{wrongKey:true},{debug:true},{status:'OutOfDate'},{status:'Revoked'}])('rejects invalid gateway evidence: %j',async options=>{const f=fixture(options);await expect(nearGatewaySigningAddress(f.fetch as typeof fetch,'model','0x'+address,undefined,f.verify)).rejects.toThrow()})
it('does not trust a quote whose hardware verification fails',async()=>{const f=fixture();f.verify.mockRejectedValue(Error('Intel chain rejected'));await expect(nearGatewaySigningAddress(f.fetch as typeof fetch,'model','0x'+address,undefined,f.verify)).rejects.toThrow('Intel chain')})
