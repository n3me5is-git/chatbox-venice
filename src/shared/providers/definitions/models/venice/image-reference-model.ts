import type { ImageModelCapabilities } from '@shared/types'

export type ReferenceImageOption = {modelId:string;vendorMetadata?:Record<string,unknown>;capabilities?:ImageModelCapabilities}

export function imageVariant(metadata?:Record<string,unknown>) {
  if (metadata?.veniceType === 'inpaint') return 'Image editing'
  if (metadata?.veniceType === 'image') return 'Text to image'
  return undefined
}

/** Editing is a separate Venice API model. Resolve only an exact catalog pair;
 * never guess another tier, version or family. The UI owns privacy and consent. */
export function referenceImageModel<T extends ReferenceImageOption>(models:readonly T[], selectedId:string, count:number):T|undefined {
  const selected=models.find(model=>model.modelId===selectedId)
  const accepts=(model:T)=>{const refs=model.capabilities?.inputReferences;return !!refs&&count>=(refs.min??0)&&count<=(refs.max??1)}
  if (!selected || count===0 || accepts(selected)) return selected
  if (selected.vendorMetadata?.veniceType!=='image') return undefined
  return models.find(model=>sameImageFamily(model.modelId,selectedId)&&model.vendorMetadata?.veniceType==='inpaint'&&accepts(model))
}

export function acceptsImageReferences(model:ReferenceImageOption|undefined,count:number) {
  const refs=model?.capabilities?.inputReferences
  return !!refs&&count>=(refs.min??0)&&count<=(refs.max??1)
}

/** Privacy is an endpoint fact, not a family property. Unknown classifications,
 * different hardware protections or filtering require an explicit model choice. */
export function canAutoSelectReferenceModel(current:ReferenceImageOption|undefined,next:ReferenceImageOption|undefined) {
  const privacy=(metadata?:Record<string,unknown>)=>{
    const value=metadata?.privacy
    return value==='anonymous'?'anonymized':['private','anonymized','tee','e2ee'].includes(String(value))?value:undefined
  }
  const before=privacy(current?.vendorMetadata),after=privacy(next?.vendorMetadata)
  if(!before||before!==after)return false
  const signature=(metadata?:Record<string,unknown>)=>{
    const caps=metadata?.capabilities as Record<string,unknown>|undefined
    const traits=[...(Array.isArray(metadata?.traits)?metadata.traits:[]),...(Array.isArray(metadata?.model_sets)?metadata.model_sets:[])]
    const filter=typeof metadata?.uncensored==='boolean'?metadata.uncensored:traits.includes('uncensored')?true:null
    return JSON.stringify([caps?.supportsTeeAttestation===true,caps?.supportsE2EE===true,filter])
  }
  return signature(current?.vendorMetadata)===signature(next?.vendorMetadata)
}

/** Selecting a Venice image family also makes its reference endpoint available.
 * The UI switches the visible model before the user approves a paid request. */
export function sameImageFamily(left:string,right:string) {
  const family=(id:string)=>id==='qwen-edit-uncensored'?'qwen-image':id.replace(/-(?:text-to-image|edit)$/,'')
  return family(left)===family(right)
}
