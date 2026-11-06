import { describe,expect,it } from 'vitest'
import { modelPriceRows,formatPrice } from './pricing'
describe('catalog billing units',()=>{
 it('distinguishes text tokens, direct speech characters, queued speech and ASR seconds',()=>{
  expect(modelPriceRows({id:'text',type:'text',model_spec:{pricing:{input:{usd:0.05},output:{usd:0.13}}}})).toMatchObject([{label:'Input / 1M tokens',divisor:1000000,singleUnit:'Per token'},{label:'Output / 1M tokens'}])
  expect(modelPriceRows({id:'tts',type:'tts',model_spec:{pricing:{input:{usd:3.5}}}})[0]).toMatchObject({label:'Input / 1M characters',singleUnit:'Per character',divisor:1000000})
  expect(modelPriceRows({id:'queued',type:'music',model_spec:{pricing:{per_thousand_characters:{usd:0.115}}}})[0]).toMatchObject({label:'Per 1,000 characters',divisor:1000})
  expect(modelPriceRows({id:'asr',type:'asr',model_spec:{pricing:{per_audio_second:{usd:0.0001}}}})[0]).toMatchObject({label:'Per audio second',divisor:undefined})
 })
 it('preserves duration tiers, image matrices and extended context prices without linear interpolation',()=>{
  expect(modelPriceRows({id:'music',type:'music',model_spec:{pricing:{durations:{60:{usd:0.69,min_seconds:3,max_seconds:60}}}}})[0]).toMatchObject({label:'Per duration tier',detail:'3–60 s',usd:0.69})
  expect(modelPriceRows({id:'image',type:'image',model_spec:{pricing:{quality:{'1K':{high:{usd:0.2}}}}}})[0]).toMatchObject({label:'Per image by quality',detail:'1K · high'})
  expect(modelPriceRows({id:'text',type:'text',model_spec:{pricing:{extended:{context_token_threshold:200000,input:{usd:1}}}}})[0]).toMatchObject({threshold:200000,label:'Input / 1M tokens'})
 })
 it('does not call missing, negative or malformed prices free, and retains explicitly free prices',()=>{
  expect(modelPriceRows({id:'video',type:'video'})).toEqual([])
  expect(modelPriceRows({id:'x',type:'text',model_spec:{pricing:{input:{usd:'0.2',diem:-1},output:{usd:0}}}})).toMatchObject([{label:'Output / 1M tokens',usd:0}])
  expect(formatPrice(0.05/1000000,'USD','en')).toBe('0.00000005 USD')
  expect(formatPrice(0.002875,'DIEM','it-IT')).toBe('0,002875 DIEM')
 })
})
