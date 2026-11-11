import {Text} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import type {MediaCatalogItem} from '@shared/providers/definitions/models/venice/media'
import {quickModelPrice,type QuickPrice} from '@shared/providers/definitions/models/venice/pricing'
import {forkT as ft} from '@/i18n/fork'
import {mediaComparisonPrice,type ComparisonPrice} from '@shared/providers/definitions/models/venice/comparison-price'
export function VeniceModelCost({model,metadata,type='image',showLabel=false,comparison=false}:{model?:MediaCatalogItem;metadata?:Record<string,unknown>;type?:string;showLabel?:boolean;comparison?:boolean}){
 useTranslation();const entry=model||(metadata?{id:'',type:String(metadata.veniceType||type),model_spec:metadata}:undefined),price=entry&&quickModelPrice(entry)
 const index=comparison&&entry?mediaComparisonPrice(entry):undefined
 if(index)return <ComparisonPriceDisplay price={index}/>
 if(!price)return entry?<Text size="xs" c="dimmed" title={ft('The provider has not supplied a fixed rate. Use the model details or request an estimate with your chosen settings.')}>{ft(showLabel?'Price not supplied by the provider':'Quote required')}</Text>:null
 return <QuickPriceDisplay price={price} showLabel={showLabel}/>
}
export function ComparisonPriceDisplay({price,showDetails=false}:{price:ComparisonPrice;showDetails?:boolean}){
 const {i18n}=useTranslation()
 const amount=price.currency==='USD'?new Intl.NumberFormat(i18n.resolvedLanguage||'en',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(price.amount):price.amount.toLocaleString(i18n.resolvedLanguage||'en',{maximumFractionDigits:4})+' DIEM'
 const unit=price.basis==='video'?`${price.resolution==='default'?ft('Model default'):price.resolution} / 5 s`:price.basis==='track'?ft('Per track'):'30 s'
 const date=price.quotedAt?new Date(price.quotedAt).toLocaleDateString(i18n.resolvedLanguage||'en'):''
 const detail=[ft('Comparison index. Options, minimum durations and source clips can change the final cost.'),price.speechEstimate?ft('Voice estimate: about 413 characters for 30 seconds.'):null,price.normalized?ft('Normalized from {{count}} seconds; this shorter duration may not be offered.',{count:price.sourceSeconds}):null,date?ft('Reference updated: {{date}}',{date}):null].filter(Boolean).join(' ')
 return <><Text component="span" size="xs" c="dimmed" title={detail} style={{whiteSpace:'normal',overflowWrap:'anywhere'}}>{price.basis==='track'?'':'≈ '}{amount} · {unit}</Text>{showDetails&&<Text size="xs" c="dimmed">{detail}</Text>}</>
}
export function QuickPriceDisplay({price,showLabel=false}:{price:QuickPrice;showLabel?:boolean}){
 const {i18n}=useTranslation()
 const format=(amount:number)=>price.currency==='USD'?new Intl.NumberFormat(i18n.resolvedLanguage||'en',{style:'currency',currency:'USD',maximumFractionDigits:6}).format(amount):new Intl.NumberFormat(i18n.resolvedLanguage||'en',{maximumFractionDigits:6}).format(amount)+' DIEM'
 const amount=price.output!==undefined?format(price.amount)+' / '+format(price.output):price.maximum!==undefined?format(price.amount)+'–'+format(price.maximum):format(price.amount)
 return <Text component="span" size="xs" c="dimmed" title={ft('Catalog price, not a quality rating. Options, references and duration may change the final cost.')} style={{whiteSpace:'normal',overflowWrap:'anywhere'}}>{showLabel?ft('Cost')+': ':''}{price.from?ft('From')+' ':''}{amount} · {ft(price.unit)}{price.output!==undefined?' '+ft('(input / output)'):''}</Text>
}
