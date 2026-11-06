import {bytesToHex,parseHex} from './crypto'
import {isTdDebugMode,parseTransportTdxQuote} from './tee'
type VerifyQuote=(quote:Uint8Array)=>Promise<{status:string}>
const verifyIntelQuote:VerifyQuote=async quote=>{
 const {getCollateralAndVerify}=await import('@phala/dcap-qvl')
 return getCollateralAndVerify(quote,'https://pccs.phala.network')
}
/** NEAR streaming is signed by its gateway, separately from the model encryption key.
 * The gateway has no GPU payload. Verify its own fresh CPU quote against Intel roots;
 * never reuse the model's server-verification verdict for this different quote. */
export async function nearGatewaySigningAddress(fetch:typeof globalThis.fetch,model:unknown,expectedAddress:string,signal?:AbortSignal|null,verify:VerifyQuote=verifyIntelQuote):Promise<string>{
 if(typeof model!=='string'||!model||model.length>200||/[\x00-\x1f]/.test(model))throw Error('The NEAR gateway model identity was not available')
 const nonce=bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
 const response=await fetch('https://cloud-api.near.ai/v1/attestation/report?'+new URLSearchParams({model,signing_algo:'ecdsa',nonce}),{method:'GET',headers:{Accept:'application/json'},signal})
 if(!response.ok)throw Error(`NEAR gateway attestation failed (HTTP ${response.status})`)
 const reader=response.body?.getReader();if(!reader)throw Error('Empty NEAR gateway attestation')
 const chunks:Uint8Array[]=[];let size=0
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024)throw Error('NEAR gateway attestation exceeds the local limit');chunks.push(part.value)}}catch(error){await reader.cancel().catch(()=>{});throw error}
 const all=new Uint8Array(size);let offset=0;for(const part of chunks){all.set(part,offset);offset+=part.length}
 const gateway=JSON.parse(new TextDecoder().decode(all)).gateway_attestation
 const address=expectedAddress.toLowerCase().replace(/^0x/,'')
 if(!/^[a-f0-9]{40}$/.test(address)||!gateway||gateway.signing_algo!=='ecdsa'||gateway.signing_address?.toLowerCase().replace(/^0x/,'')!==address||gateway.request_nonce!==nonce)throw Error('NEAR gateway identity or nonce did not match')
 const quote=typeof gateway.intel_quote==='string'?parseTransportTdxQuote(gateway.intel_quote,'near-ai'):undefined
 if(!quote||isTdDebugMode(quote.tdAttributes)||quote.reportData.slice(0,40)!==address||quote.reportData.slice(40,64)!=='0'.repeat(24)||quote.reportData.slice(64)!==nonce)throw Error('NEAR gateway quote did not bind its signing key and fresh nonce')
 const bytes=parseHex(gateway.intel_quote)!,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
 // The parsed v4 report has a strict, declared DCAP length after transport padding.
 if(view.getUint16(0,true)!==4)throw Error('Unsupported NEAR gateway quote version')
 signal?.throwIfAborted()
 const verdict=await verify(bytes.subarray(0,636+view.getUint32(632,true)))
 signal?.throwIfAborted()
 if(verdict.status!=='UpToDate')throw Error('NEAR gateway Intel verification did not report UpToDate')
 return address
}
