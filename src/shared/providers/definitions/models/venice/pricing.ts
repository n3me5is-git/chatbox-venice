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
export interface QuickPrice{amount:number;maximum?:number;currency:'USD'|'DIEM';unit:'1M tokens'|'1M characters'|'1,000 characters'|'image'|'second'|'generation';output?:number;from?:boolean}
/** Compare prices only within a declared billing unit; never infer model quality from price. */
export function quickModelPrice(model:MediaCatalogItem):QuickPrice|undefined{
 const rows=modelPriceRows(model).filter(row=>!['upscale','inputImages','cache_input','cache_write'].some(key=>row.id===key||row.id.startsWith(key+'.')))
 const currency=rows.some(row=>row.usd!==undefined)?'USD':'DIEM',value=(row:PriceRow)=>currency==='USD'?row.usd:row.diem
 const input=rows.find(row=>row.id==='input'),output=rows.find(row=>row.id==='output')
 if(input&&value(input)!==undefined)return {amount:value(input)!,currency,unit:model.type==='tts'?'1M characters':'1M tokens',...(output&&value(output)!==undefined?{output:value(output)}:{})}
 const group=rows.filter(row=>value(row)!==undefined&&row.id.startsWith('per_thousand_characters'))
 if(group.length)return {amount:Math.min(...group.map(row=>value(row)!)),currency,unit:'1,000 characters',from:group.length>1}
 const seconds=rows.filter(row=>value(row)!==undefined&&/^per_(audio_)?second(?:\.|$)/.test(row.id))
 if(seconds.length)return {amount:Math.min(...seconds.map(row=>value(row)!)),currency,unit:'second',from:seconds.length>1}
 const images=rows.filter(row=>value(row)!==undefined&&/^(generation|inpaint|resolutions|quality)(?:\.|$)/.test(row.id))
 const selected=images.length?images:rows.filter(row=>value(row)!==undefined&&row.id.startsWith('durations'))
 if(!selected.length)return undefined
 const amounts=selected.map(row=>value(row)!),amount=Math.min(...amounts),maximum=Math.max(...amounts)
 return {amount,currency,unit:['image','inpaint'].includes(model.type)?'image':'generation',...(maximum>amount?{maximum,from:true}:{})}
}
