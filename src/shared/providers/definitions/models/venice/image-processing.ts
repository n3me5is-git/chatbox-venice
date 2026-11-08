import type { ImageGeneration } from '../../../../types'
import type { RequestAdapter } from '../../../../types/adapters'
import { imageDimensions } from '../../../../utils/image-dimensions'
import { assertVeniceEnabled,type VeniceOptions } from './options'
import { requireModelPrivacy } from './privacy'
import {responseFailureReason} from './failure-reason'
export type ImageOperation='background-remove'|'upscale'
export interface ImageProcessingStore {
 ensure(scope:string):Promise<void>;create(record:ImageGeneration):Promise<void>;update(id:string,patch:Partial<ImageGeneration>):Promise<unknown>;
 save(record:ImageGeneration,response:Response,mime:string,signal:AbortSignal):Promise<string>
}
export async function processVeniceImage(input:{file:File;operation:ImageOperation;scale?:2|4;creativity?:number;protection?:string;title:string;metadata?:Record<string,unknown>},configuration:{apiKey:string;apiHost?:string;options:VeniceOptions},store:ImageProcessingStore,request:RequestAdapter['apiRequest'],signal:AbortSignal):Promise<ImageGeneration>{
 signal.throwIfAborted();assertVeniceEnabled(configuration.options)
 if(!configuration.apiKey.trim())throw Error('Configure a Venice API key first')
 requireModelPrivacy(input.metadata,configuration.options.privacyFilter)
 if(!['background-remove','upscale'].includes(input.operation))throw Error('Unknown image operation')
 if(!['image/png','image/jpeg','image/webp'].includes(input.file.type)||input.file.size>25*1024*1024)throw Error('Use a PNG, JPEG or WebP image up to 25 MB')
 const dimensions=imageDimensions(new Uint8Array(await input.file.slice(0,65536).arrayBuffer()))
 if(!dimensions)throw Error('Unable to read the image dimensions')
 if(input.operation==='upscale'&&(dimensions.width<256||dimensions.height<256||dimensions.width*dimensions.height>=16777216))throw Error('Upscaling requires at least 256 × 256 pixels and fewer than 16 megapixels')
 if(input.scale!==undefined&&![2,4].includes(input.scale)||input.creativity!==undefined&&(!Number.isFinite(input.creativity)||input.creativity<0||input.creativity>0.02))throw Error('Invalid upscaling options')
 await store.ensure(input.protection||'public');signal.throwIfAborted()
 const record:ImageGeneration={id:crypto.randomUUID(),prompt:input.title,referenceImages:[],generatedImages:[],createdAt:Date.now(),model:{provider:'venice',modelId:'venice-'+input.operation},status:'generating',protection:input.protection,imageGenerateNum:1}
 await store.create(record)
 try{
  const body=new FormData();body.set('image',input.file)
  if(input.operation==='upscale'){body.set('scale',String(input.scale||2));body.set('creativity',String(input.creativity??0.01))}
  signal.throwIfAborted()
  const response=await request({url:(configuration.apiHost||'https://api.venice.ai/api/v1').replace(/\/+$/,'')+'/image/'+input.operation,method:'POST',headers:{Authorization:'Bearer '+configuration.apiKey},body,signal,useProxy:false,retry:0})
  if(!response.ok)throw Error(`Venice image processing failed (HTTP ${response.status}): ${await responseFailureReason(response)}. No paid request was retried.`)
  const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase()
  if(!['image/png','image/webp','image/jpeg'].includes(mime)||input.operation==='background-remove'&&mime!=='image/png'){await response.body?.cancel();throw Error('Venice returned an unexpected image type')}
  const key=await store.save(record,response,mime,signal);signal.throwIfAborted()
  const done={...record,generatedImages:[key],status:'done' as const};await store.update(record.id,{generatedImages:[key],status:'done'});return done
 }catch(error){await store.update(record.id,{status:'error',error:error instanceof Error?error.message:String(error)}).catch(()=>{});throw error}
}
