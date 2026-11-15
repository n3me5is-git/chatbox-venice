import type {ModelInterface} from '@shared/models/types'
import {localOcrVariant} from '@shared/local-ocr'
import {recognizeLocally} from './client'
/** An OCR-role adapter, deliberately not registered as a chat model. */
export function localOcrModel(modelId:string):ModelInterface{
 if(!localOcrVariant(modelId))throw Error('Choose a supported local OCR model')
 return {name:'MiniCPM-OCR · Local',modelId,isSupportVision:()=>true,isSupportToolUse:()=>false,isSupportSystemMessage:()=>false,normalizeCompletedResponse:parts=>parts,paint:async()=>{throw Error('Local MiniCPM supports OCR only')},chatStream:async function*(){throw Error('Local MiniCPM supports OCR only')},chat:async(messages,options)=>{
  const images=messages.flatMap(message=>Array.isArray(message.content)?message.content.filter(part=>part.type==='image').map(part=>part.type==='image'?part.image:null):[])
  if(images.length!==1||typeof images[0]!=='string'||!images[0].startsWith('data:'))throw Error('Local MiniCPM OCR needs one local image')
  const text=await recognizeLocally(modelId,images[0],options.signal);return {contentParts:[{type:'text',text}]}
 }}
}
