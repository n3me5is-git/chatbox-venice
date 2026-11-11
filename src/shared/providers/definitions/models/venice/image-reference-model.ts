import type { ImageModelCapabilities } from '@shared/types'

type ImageOption = {modelId:string;vendorMetadata?:Record<string,unknown>;capabilities?:ImageModelCapabilities}

export function imageVariant(metadata?:Record<string,unknown>) {
  if (metadata?.veniceType === 'inpaint') return 'Image editing'
  if (metadata?.veniceType === 'image') return 'Text to image'
  return undefined
}

/** Editing is a separate Venice API model. Resolve only an exact catalog pair,
 * never a similarly named, newer, differently priced or disabled family. */
export function referenceImageModel<T extends ImageOption>(models:readonly T[], selectedId:string, count:number):T|undefined {
  const selected=models.find(model=>model.modelId===selectedId)
  const accepts=(model:T)=>{const refs=model.capabilities?.inputReferences;return !!refs&&count>=(refs.min??0)&&count<=(refs.max??1)}
  if (!selected || count===0 || accepts(selected)) return selected
  if (selected.vendorMetadata?.veniceType!=='image') return undefined
  return models.find(model=>sameImageFamily(model.modelId,selectedId)&&model.vendorMetadata?.veniceType==='inpaint'&&accepts(model))
}

/** Selecting a Venice image family also makes its reference endpoint available.
 * The UI switches the visible model before the user approves a paid request. */
export function sameImageFamily(left:string,right:string) {
  const family=(id:string)=>id==='qwen-edit-uncensored'?'qwen-image':id.replace(/-(?:text-to-image|edit)$/,'')
  return family(left)===family(right)
}
