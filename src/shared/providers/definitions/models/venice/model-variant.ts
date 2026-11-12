import type { MediaCatalogItem } from './media'
import { videoModelFamilies } from './video-docs'
import pages from './model-pages.json'

export function veniceModelPage(modelId: string) {
  // E2EE routes have their own privacy-specific cards even when the public
  // documentation groups them with an ordinary model family.
  const slug=modelId.startsWith('e2ee-')?modelId:(pages.pages as Record<string,string>)[modelId]||modelId
  return `https://venice.ai/models/${encodeURIComponent(slug)}`
}

export function videoModelDocumentation(model:MediaCatalogItem){
  const family=videoModelFamilies[model.id]
  return family?`https://docs.venice.ai/models/${encodeURIComponent(family)}?v=${encodeURIComponent(model.id)}`:'https://docs.venice.ai/models/video'
}

/** Distinguish API routes sharing a display name; never infer filter or privacy status. */
export function videoVariant(model?: MediaCatalogItem): string | undefined {
  if (model?.type !== 'video') return undefined
  // Reference routes can advertise image-to-video as their underlying transport.
  if (/reference-to-video|omni-reference/.test(model.id)) return 'References to video'
  const mode = String(model.model_spec?.constraints?.model_type || '')
  const labels: Record<string, string> = {
    'text-to-video': 'Text to video', 'image-to-video': 'Image to video',
    'reference-to-video': 'References to video', 'video-to-video': 'Video editing',
  }
  if (labels[mode]) return labels[mode]
  if (/edit-video|video-to-video/.test(model.id)) return 'Video editing'
  return undefined
}
