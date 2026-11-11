import type { ImageModelCapabilities, ProviderModelInfo, ProviderSettings } from '../../../../types'
import { mergeExtraBody } from '../../../../models/utils/extra-body'

export function getVeniceImageCapabilities(model: ProviderModelInfo): ImageModelCapabilities {
  const metadata = model.vendorMetadata || {}
  const constraints = (metadata.constraints || {}) as Record<string, unknown>
  const capabilities = (metadata.capabilities || {}) as Record<string, unknown>
  const editing = metadata.veniceType === 'inpaint'
  const styleReferences = metadata.supportsStyleReferences === true || constraints.supportsStyleReferences === true || capabilities.supportsStyleReferences === true
  const max = editing ? Number(constraints.maxInputImages ?? capabilities.maxInputImages ?? (constraints.combineImages === false ? 1 : 3))
    : Number(constraints.maxStyleReferences ?? capabilities.maxStyleReferences ?? 1)
  const ratios = constraints.aspectRatios ?? constraints.aspect_ratios
  return {
    aspectRatio: { values: Array.isArray(ratios) ? ratios.filter((r): r is string => typeof r === 'string') : ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'] },
    inputReferences: editing || styleReferences ? { min: editing ? 1 : 0, max: Number.isSafeInteger(max) && max > 0 ? max : 1 } : null,
  }
}

/** Shared by the adapter and the dependency-free live API smoke test. */
export function buildVeniceImageRequest(model:ProviderModelInfo, settings:NonNullable<ProviderSettings['venice']>, params:{prompt:string;images?:{imageUrl:string}[];aspectRatio?:string}) {
  const image = settings.image || {}
  const editing = model.vendorMetadata?.veniceType === 'inpaint'
  const capabilities = getVeniceImageCapabilities(model)
  const references = params.images || []
  if (editing && !references.length) throw new Error('This Venice model requires a reference image')
  if (references.length && (!capabilities.inputReferences || references.length > (capabilities.inputReferences.max ?? 1))) {
    throw new Error('The selected Venice model does not support this number of reference images')
  }
  const ratios=capabilities.aspectRatio?.values
  if(params.aspectRatio&&params.aspectRatio!=='auto'&&ratios?.length&&!ratios.includes(params.aspectRatio))throw new Error('This model does not support the selected aspect ratio. Choose Auto or a ratio from the model details.')
  if ((image.width === undefined) !== (image.height === undefined)) throw new Error('Set both image width and height')
  if (image.width !== undefined && params.aspectRatio && params.aspectRatio !== 'auto') throw new Error('Choose pixel dimensions or aspect ratio, not both')
  const format = image.format || 'png'
  const common = {
    prompt: params.prompt,
    safe_mode: settings.imageSafeMode ?? true,
    ...(image.resolution ? { resolution: image.resolution } : {}),
    ...(image.quality ? { quality: image.quality } : {}),
    ...(image.enhance_prompt !== undefined ? { enhance_prompt: image.enhance_prompt } : {}),
    ...(params.aspectRatio && params.aspectRatio !== 'auto' ? { aspect_ratio: params.aspectRatio } : {}),
  }
  const request = mergeExtraBody(editing ? {
    ...common, modelId: model.modelId, images: references.map(ref => ref.imageUrl), output_format: format,
  } : {
    ...image, ...common, model: model.modelId,
    enable_web_search: settings.imageWebSearch ?? false,
    embed_exif_metadata: image.embed_exif_metadata ?? false,
    format, return_binary: false, variants: 1,
    ...(references.length ? { style_references: references.map(ref => ({ image: ref.imageUrl })) } : {}),
  }, model.extraBody || {})
  if ((editing ? request.modelId : request.model) !== model.modelId || request.prompt !== params.prompt || (!editing && request.variants !== 1)) throw new Error('Model, prompt and quantity must match the approved request. Use the dedicated controls instead of overriding them in JSON.')
  if(editing&&JSON.stringify(request.images)!==JSON.stringify(references.map(ref=>ref.imageUrl))||!editing&&references.length&&JSON.stringify(request.style_references)!==JSON.stringify(references.map(ref=>({image:ref.imageUrl}))))throw new Error('Reference images must match the approved request. Use the dedicated image controls instead of JSON.')
  return { request, editing, format, path: `/image/${editing ? 'multi-edit' : 'generate'}` }
}
