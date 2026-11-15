/** Desktop-only OCR identity; kept outside the chat/provider catalog. */
export const LOCAL_OCR_PROVIDER = 'local-minicpm-ocr'
export const LOCAL_OCR_MODELS = {q4:'minicpm-ocr-1.0-q4-k-m-0133ad8',q8:'minicpm-ocr-1.0-q8-0-0133ad8'} as const
export type LocalOcrVariant = keyof typeof LOCAL_OCR_MODELS
export type LocalOcrConfig = {backend:'cpu'|'vulkan';threads:number;idleSeconds:number}
export type LocalOcrStatus = {config:LocalOcrConfig;ready:LocalOcrVariant[];projector:boolean;runtime:boolean;loaded:boolean;starting?:boolean;pending:number;busy:boolean;progress?:{name:string;bytes:number;total:number};error?:string;diagnostic?:string;root:string;platformSupported:boolean}
export const localOcrVariant = (id:string):LocalOcrVariant|undefined => (Object.keys(LOCAL_OCR_MODELS) as LocalOcrVariant[]).find(key=>LOCAL_OCR_MODELS[key]===id)
export function validateLocalOcrConfig(input:unknown):LocalOcrConfig {
 const value=input as Partial<LocalOcrConfig>|null
 if(!value||!['cpu','vulkan'].includes(value.backend||'')||!Number.isInteger(value.threads)||value.threads!<1||value.threads!>32||!Number.isInteger(value.idleSeconds)||value.idleSeconds!<0||value.idleSeconds!>1800)throw Error('Invalid local OCR settings')
 return value as LocalOcrConfig
}
/** One bounded page of look-ahead; the current page can run on the native worker. */
export async function* prefetchOcrPages<T>(pages:AsyncIterable<T>,signal:AbortSignal){
 const iterator=pages[Symbol.asyncIterator]();let next=iterator.next();void next.catch(()=>{})
 try{while(true){signal.throwIfAborted();const item=await next;if(item.done)break;next=iterator.next();void next.catch(()=>{});yield item.value}}finally{await next.catch(()=>{});await iterator.return?.()}
}
