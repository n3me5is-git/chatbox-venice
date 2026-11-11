import { describe, expect, it } from 'vitest'
import { referenceImageModel, sameImageFamily } from './image-reference-model'
import { buildVeniceImageRequest, getVeniceImageCapabilities } from './image-request'

const pair=(base:string,edit:string,max:number)=>[
  {modelId:base,vendorMetadata:{veniceType:'image'},capabilities:getVeniceImageCapabilities({modelId:base,vendorMetadata:{veniceType:'image'}})},
  {modelId:edit,vendorMetadata:{veniceType:'inpaint',constraints:{maxInputImages:max}},capabilities:getVeniceImageCapabilities({modelId:edit,vendorMetadata:{veniceType:'inpaint',constraints:{maxInputImages:max}}})},
]
const families=[['qwen-image','qwen-edit-uncensored',3],['qwen-image-2-1-pro','qwen-image-2-1-pro-edit',10],['seedream-v5-5','seedream-v5-5-edit',10],['gpt-image-2-5-flare','gpt-image-2-5-flare-edit',6],['wan-2-7-pro-text-to-image','wan-2-7-pro-edit',6],['minimax-h3-image','minimax-h3-image-edit',16]] as const

describe('catalog-backed reference variants',()=>{
 it.each(families)('selects the exact %s reference variant before approval', (base,edit,max)=>{
   const models=pair(base,edit,max)
   expect(sameImageFamily(base,edit)).toBe(true)
   expect(referenceImageModel(models,base,0)?.modelId).toBe(base)
   expect(referenceImageModel(models,base,max)?.modelId).toBe(edit)
   expect(referenceImageModel(models,base,max+1)).toBeUndefined()
   expect(referenceImageModel([models[0]],base,1)).toBeUndefined()
   const images=Array.from({length:max},(_,i)=>({imageUrl:`data:image/png;base64,${btoa(String(i))}`}))
   const built=buildVeniceImageRequest(models[1],{imageSafeMode:false},{prompt:'Combine all references',images})
   expect(built.path).toBe('/image/multi-edit')
   expect(built.request).toMatchObject({modelId:edit,images:images.map(ref=>ref.imageUrl),safe_mode:false,output_format:'png'})
   expect(built.request).not.toHaveProperty('style_references')
   expect(()=>buildVeniceImageRequest(models[1],{},{prompt:'test',images:[...images,images[0]]})).toThrow('number of reference')
 })
 it('never substitutes a more expensive/newer tier or a video model for an image model',()=>{
   const models=[...pair('qwen-image-2','qwen-image-2-pro-edit',3),...pair('wan-2-7-text-to-image','wan-2-7-pro-edit',6)]
   expect(referenceImageModel(models,'qwen-image-2',1)).toBeUndefined()
   expect(referenceImageModel(models,'wan-2-7-text-to-image',1)).toBeUndefined()
 })
 it('retains genuine style-reference generation and single-input editors',()=>{
   const style={modelId:'style',vendorMetadata:{veniceType:'image',supportsStyleReferences:true,constraints:{maxStyleReferences:2}}}
   expect(buildVeniceImageRequest(style,{},{prompt:'p',images:[{imageUrl:'data:image/png;base64,YQ=='}]})).toMatchObject({path:'/image/generate',request:{model:'style',style_references:[{image:'data:image/png;base64,YQ=='}]}})
   expect(getVeniceImageCapabilities({modelId:'luma-uni-1-edit',vendorMetadata:{veniceType:'inpaint',constraints:{combineImages:false}}}).inputReferences).toEqual({min:1,max:1})
 })
})
