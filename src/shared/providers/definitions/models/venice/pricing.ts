import type { MediaCatalogItem } from './media'
export type PriceRow={id:string;label:string;detail?:string;threshold?:number;usd?:number;diem?:number;divisor?:number;singleUnit?:string}
const labels:Record<string,string>={input:'Input / 1M tokens',output:'Output / 1M tokens',cache_input:'Cached input / 1M tokens',cache_write:'Cache write / 1M tokens',generation:'Per generation',inpaint:'Per edit',per_second:'Per second',per_audio_second:'Per audio second',per_thousand_characters:'Per 1,000 characters',durations:'Per duration tier',quality:'Per image by quality',resolutions:'Per image by resolution',upscale:'Per upscale',inputImages:'Additional reference image'}
const valid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0
/** Catalog prices are never inferred from a model name, nor is missing data free. */
export function modelPriceRows(model:MediaCatalogItem):PriceRow[]{
 const rows:PriceRow[]=[],pricing=model.model_spec?.pricing
 if(!pricing||typeof pricing!=='object')return rows
 function visit(value:unknown,keys:string[],threshold?:number){
  if(!value||typeof value!=='object'||Array.isArray(value)||keys.length>5||rows.length>=200)return
  const entry=value as Record<string,unknown>,root=keys[0]==='extended'?keys[1]:keys[0]
  if(valid(entry.usd)||valid(entry.diem)){
   const token=['input','output','cache_input','cache_write'].includes(root)
   const characters=model.type==='tts'&&root==='input'
   const divisor=token?1_000_000:root==='per_thousand_characters'?1000:undefined
   const detailKeys=keys.filter(key=>!['extended',root,'additional'].includes(key))
   const seconds=valid(entry.min_seconds)&&valid(entry.max_seconds)?`${entry.min_seconds}–${entry.max_seconds} s`:undefined
   rows.push({id:keys.join('.'),label:characters?'Input / 1M characters':labels[root]||'Catalog rate (unit unspecified)',detail:seconds||detailKeys.join(' · ')||undefined,threshold,
    usd:valid(entry.usd)?entry.usd:undefined,diem:valid(entry.diem)?entry.diem:undefined,divisor,singleUnit:divisor?(characters||root==='per_thousand_characters'?'Per character':'Per token'):undefined})
   return
  }
  for(const [key,item]of Object.entries(entry))visit(item,[...keys,key],keys.length===0&&key==='extended'&&valid((item as Record<string,unknown>)?.context_token_threshold)?Number((item as Record<string,unknown>).context_token_threshold):threshold)
 }
 visit(pricing,[])
 return rows
}
export function formatPrice(amount:number,currency:'USD'|'DIEM',locale='en'){
 if(!valid(amount))throw Error('Invalid catalog price')
 return new Intl.NumberFormat(locale,{maximumSignificantDigits:9}).format(amount)+' '+currency
}
