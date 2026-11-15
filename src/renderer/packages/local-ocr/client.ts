import type {LocalOcrStatus} from '@shared/local-ocr'
export function localOcrDesktop(){return typeof window!=='undefined'&&typeof window.electronAPI?.invoke==='function'}
export async function localOcrControl(command:string,value?:unknown):Promise<any>{if(!localOcrDesktop())throw Error('Local MiniCPM OCR is available on desktop only');try{return await window.electronAPI.invoke('local-ocr:control',command,value)}catch(error){throw Error((error as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''))}}
export async function recognizeLocally(modelId:string,image:string,signal?:AbortSignal):Promise<string>{
 signal?.throwIfAborted();const id=crypto.randomUUID(),cancel=()=>{void localOcrControl('cancel',id).catch(()=>{})};signal?.addEventListener('abort',cancel,{once:true})
 try{const result=await localOcrControl('ocr',{id,modelId,image});signal?.throwIfAborted();if(typeof result!=='string')throw Error('Invalid local OCR response');return result}finally{signal?.removeEventListener('abort',cancel)}
}
export const localOcrStatus=()=>localOcrControl('status') as Promise<LocalOcrStatus>
