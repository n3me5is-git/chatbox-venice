import type {ModelInterface} from '@shared/models/types'
import {PADDLE_OCR_MODEL} from '@shared/paddle-ocr'
import {recognizePaddle} from './client'
export function paddleOcrModel(modelId:string):ModelInterface{
 if(modelId!==PADDLE_OCR_MODEL)throw Error('Choose a supported local OCR model')
 return {name:'PaddleOCR · Local',modelId,isSupportVision:()=>true,isSupportToolUse:()=>false,isSupportSystemMessage:()=>false,normalizeCompletedResponse:parts=>parts,paint:async()=>{throw Error('Local PaddleOCR supports text recognition only')},chatStream:async function*(){throw Error('Local PaddleOCR supports text recognition only')},chat:async(messages,options)=>{
  const images=messages.flatMap(message=>Array.isArray(message.content)?message.content.filter(part=>part.type==='image').map(part=>part.type==='image'?part.image:null):[])
  if(images.length!==1||typeof images[0]!=='string'||!images[0].startsWith('data:'))throw Error('Local PaddleOCR needs one local image')
  const text=await recognizePaddle(modelId,images[0],options.signal);return {contentParts:[{type:'text',text}]}
 }}
}
