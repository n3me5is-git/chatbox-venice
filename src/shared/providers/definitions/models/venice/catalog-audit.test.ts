import {describe,it,expect} from 'vitest'
import fixture from '../../../../../../test/fixtures/venice/catalog-2026-11-08.json'
import {mediaCategory,supportsMediaKind,videoInputs} from './media-capabilities'
import {quickModelPrice,modelPriceRows} from './pricing'
import {fetchVeniceCatalogModels,fetchVeniceModels,getVeniceImageCapabilities} from '../venice'
import {projectVeniceModels} from './model-selection'
import {buildImageModelGroups} from '@chatbox/core/application/image-generation'
import {ModelProviderEnum,type ProviderModelInfo} from '../../../../types'
import type {MediaCatalogItem} from './media'
import type {ModelDependencies} from '../../../../types/adapters'
const models=fixture.models as unknown as (MediaCatalogItem&{expectedCategory:string})[]
const dependencies={request:{apiRequest:async()=>new Response(JSON.stringify({data:models}),{headers:{'Content-Type':'application/json'}})}} as unknown as ModelDependencies
describe('all 405 Venice catalog entries recorded 2026-11-08',()=>{
 it('pins the audit scope, including dedicated decision/upscale endpoints',()=>{expect(models).toHaveLength(405);expect(new Set(models.map(model=>model.id)).size).toBe(405);expect(models.filter(model=>['decision','upscale'].includes(model.type))).toHaveLength(3)})
 it.each(models)('$id has the reviewed content category',model=>expect(mediaCategory(model)).toBe(model.expectedCategory))
 it('keeps every image/edit model selectable even if its saved type/privacy is obsolete',async()=>{
  const current=await fetchVeniceCatalogModels({apiKey:'test'},dependencies),images=current.filter(model=>model.type==='image')
  expect(images).toHaveLength(75)
  const saved:ProviderModelInfo[]=current.map(model=>({...model,type:'chat',vendorMetadata:{privacy:'anonymized'},nickname:'My '+model.modelId}))
  const groups=buildImageModelGroups({providers:[{id:ModelProviderEnum.Venice,name:'Venice'}],settings:{providers:{venice:{apiKey:'test',models:saved,venice:{privacyFilter:'all'}}}},platform:'desktop',remoteModels:{venice:images.map(model=>({modelId:model.modelId,displayName:model.nickname||model.modelId,vendorMetadata:model.vendorMetadata,capabilities:getVeniceImageCapabilities(model)}))}})
  expect(groups[0].models.map(model=>model.modelId).sort()).toEqual(images.map(model=>model.modelId).sort())
  expect(groups[0].models.find(model=>model.modelId==='krea-2-turbo')?.vendorMetadata?.privacy).toBe('private')
  const corrected=projectVeniceModels(saved,current);for(const model of corrected)expect(model.type).toBe(current.find(row=>row.modelId===model.modelId)?.type)
 })
 it('applies privacy to current metadata while keeping user labels and extra parameters',async()=>{
  const raw=await fetchVeniceCatalogModels({apiKey:'test',venice:{privacyFilter:'private'}},dependencies),visible=await fetchVeniceModels({apiKey:'test',venice:{privacyFilter:'private'}},dependencies)
  expect(raw.some(model=>model.vendorMetadata?.privacy==='anonymized')).toBe(true)
  expect(visible.some(model=>model.vendorMetadata?.privacy==='anonymized')).toBe(false)
  const row=raw.find(model=>model.modelId==='krea-2-turbo')!,saved={...row,type:'chat' as const,nickname:'My Krea',extraBody:{seed:123},vendorMetadata:{privacy:'anonymized'}}
  const corrected=projectVeniceModels([saved],raw,{privacyFilter:'private'});expect(corrected[0]).toMatchObject({type:'image',nickname:'My Krea',extraBody:{seed:123},vendorMetadata:{privacy:'private'}})
  expect(getVeniceImageCapabilities(row).inputReferences).toBeNull()
 })
 it('keeps queued ElevenLabs/Seed voices out of music and supports Stable Audio in both audio categories',()=>{
  const voices=models.filter(model=>model.type==='music'&&model.expectedCategory==='speech');expect(voices).toHaveLength(5)
  for(const voice of voices){expect(supportsMediaKind(voice,'music')).toBe(false);expect(supportsMediaKind(voice,'speech')).toBe(true)}
  const stable=models.find(model=>model.id==='stable-audio-25')!;expect(supportsMediaKind(stable,'music')).toBe(true);expect(supportsMediaKind(stable,'sound-effects')).toBe(true)
 })
 it('honors explicit video-input flags instead of guessing from edit names',()=>{
  for(const model of models.filter(model=>model.type==='video')){const constraint=model.model_spec?.constraints||{},input=videoInputs(model);if(typeof constraint.video_input==='boolean')expect(input.video,model.id).toBe(constraint.video_input)}
  expect(videoInputs(models.find(model=>model.id==='seedance-2-5-edit-video-basic')).video).toBe(false)
 })
 it('never treats a missing rate as free or quotes an upscale surcharge as an image price',()=>{
  for(const model of models){for(const row of modelPriceRows(model))for(const value of [row.usd,row.diem])if(value!==undefined)expect(Number.isFinite(value)&&value>=0,model.id).toBe(true);const price=quickModelPrice(model);if(price)expect(price.amount>=0&&Number.isFinite(price.amount),model.id).toBe(true)}
  expect(quickModelPrice(models.find(model=>model.id==='krea-2-turbo')!)).toMatchObject({amount:0.04,maximum:0.06,unit:'image',currency:'USD'})
  expect(quickModelPrice({id:'unknown',type:'image',model_spec:{pricing:{upscale:{usd:0.02}}}})).toBeUndefined()
 })
})
