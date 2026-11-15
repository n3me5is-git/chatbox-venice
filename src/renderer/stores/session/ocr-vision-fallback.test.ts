import {beforeEach,expect,it,vi} from 'vitest'
import {PADDLE_OCR_PROVIDER,PADDLE_OCR_MODEL} from '@shared/paddle-ocr'
import type {Settings} from '@shared/types'
const state=vi.hoisted(()=>({local:vi.fn(),remote:vi.fn(),create:vi.fn(),vision:true}))
vi.mock('@/adapters',()=>({createModelDependencies:vi.fn()}))
vi.mock('@/packages/paddle-ocr/model',()=>({paddleOcrModel:()=>({name:'PaddleOCR · Local',chat:state.local})}))
vi.mock('@shared/models',()=>({getModel:(...args:any[])=>{state.create(...args);return {name:'custom vision',isSupportVision:()=>state.vision,chat:state.remote}}}))
import {getOCRModel} from './ocr-helper'
const result=(text:string)=>({contentParts:[{type:'text' as const,text}]})
const cfg=(mode:'empty'|'always'|'off'='empty')=>({ocrModel:{provider:PADDLE_OCR_PROVIDER,model:PADDLE_OCR_MODEL},ocrVisionFallback:{mode,provider:'custom',model:'my-vision-model'},providers:{custom:{apiKey:'test'}}}) as unknown as Settings
beforeEach(()=>{vi.clearAllMocks();state.vision=true;state.local.mockResolvedValue(result('local text'));state.remote.mockResolvedValue(result('vision text'))})
it('keeps global OCR entirely local unless the explicitly selected fallback is needed',async()=>{
 const model=getOCRModel(cfg(),{uuid:'test'},{} as any)!.model;expect(state.create).not.toHaveBeenCalled();expect(await model.chat([],{sessionId:'chat'})).toEqual(result('local text'));expect(state.remote).not.toHaveBeenCalled()
 state.local.mockResolvedValueOnce(result(''));expect(await model.chat([],{sessionId:'chat'})).toEqual(result('vision text'));expect(state.create).toHaveBeenCalledWith(expect.objectContaining({provider:'custom',modelId:'my-vision-model',subscriptionWebSearch:false}),expect.anything(),expect.anything(),expect.anything());expect(state.remote).toHaveBeenCalledWith([],{sessionId:'chat',maxSteps:1,tools:{}})
})
it('routes global always mode directly to the vision model and rejects a text-only fallback',async()=>{
 const model=getOCRModel(cfg('always'),{uuid:'test'},{} as any)!.model;expect(await model.chat([],{})).toEqual(result('vision text'));expect(state.local).not.toHaveBeenCalled();state.vision=false;await expect(model.chat([],{})).rejects.toThrow('Choose a vision model for OCR')
})
