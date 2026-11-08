import {Text} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import type {MediaCatalogItem} from '@shared/providers/definitions/models/venice/media'
import {quickModelPrice} from '@shared/providers/definitions/models/venice/pricing'
import {forkT as ft} from '@/i18n/fork'
export function VeniceModelCost({model,metadata,type='image',showLabel=false}:{model?:MediaCatalogItem;metadata?:Record<string,unknown>;type?:string;showLabel?:boolean}){
 const {i18n}=useTranslation(),entry=model||(metadata?{id:'',type:String(metadata.veniceType||type),model_spec:metadata}:undefined),price=entry&&quickModelPrice(entry)
 if(!price)return entry?<Text size="xs" c="dimmed" title={ft('The provider has not supplied a fixed rate. Use the model details or request an estimate with your chosen settings.')}>{ft(showLabel?'Price not supplied by the provider':'Quote required')}</Text>:null
 const format=(amount:number)=>price.currency==='USD'?new Intl.NumberFormat(i18n.resolvedLanguage||'en',{style:'currency',currency:'USD',maximumFractionDigits:6}).format(amount):new Intl.NumberFormat(i18n.resolvedLanguage||'en',{maximumFractionDigits:6}).format(amount)+' DIEM'
 const amount=price.output!==undefined?format(price.amount)+' / '+format(price.output):price.maximum!==undefined?format(price.amount)+'–'+format(price.maximum):format(price.amount)
 return <Text component="span" size="xs" c="dimmed" title={ft('Catalog price, not a quality rating. Options, references and duration may change the final cost.')} style={{whiteSpace:'normal',overflowWrap:'anywhere'}}>{showLabel?ft('Cost')+': ':''}{price.from?ft('From')+' ':''}{amount} · {ft(price.unit)}{price.output!==undefined?' '+ft('(input / output)'):''}</Text>
}
