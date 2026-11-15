import {Capacitor,registerPlugin} from '@capacitor/core'
import {PADDLE_OCR_MODEL,type PaddleOcrStatus} from '@shared/paddle-ocr'
const native=registerPlugin<{control(input:{command:string;value?:unknown}):Promise<any>}>('PaddleOCR')
export function paddleOcrAvailable(){return typeof window!=='undefined'&&typeof window.electronAPI?.invoke==='function'||Capacitor.getPlatform()==='android'}
export async function paddleOcrControl(command:string,value?:unknown):Promise<any>{
 try{if(typeof window!=='undefined'&&typeof window.electronAPI?.invoke==='function')return await window.electronAPI.invoke('paddle-ocr:control',command,value);if(Capacitor.getPlatform()==='android')return await native.control({command,...(value===undefined?{}:{value})});throw Error('Local PaddleOCR is unavailable on this device')}catch(error){throw Error((error as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''))}
}
export const paddleOcrStatus=()=>paddleOcrControl('status') as Promise<PaddleOcrStatus>
export async function recognizePaddle(modelId:string,image:string,signal?:AbortSignal):Promise<string>{
 if(modelId!==PADDLE_OCR_MODEL)throw Error('Choose a supported local OCR model');signal?.throwIfAborted();const id=crypto.randomUUID();let rejectCancelled:(error:Error)=>void=()=>{};const cancelled=new Promise<never>((_,reject)=>{rejectCancelled=reject}),cancel=()=>{rejectCancelled(new DOMException('Aborted','AbortError'));void paddleOcrControl('cancel',id).catch(()=>{})};signal?.addEventListener('abort',cancel,{once:true})
 try{const result=await Promise.race([paddleOcrControl('ocr',{id,modelId,image}),cancelled]);signal?.throwIfAborted();const text=typeof result==='string'?result:result?.text;if(typeof text!=='string'||text.length>512000)throw Error('Invalid local OCR response');return text}finally{signal?.removeEventListener('abort',cancel)}
}
