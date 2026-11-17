import { RagSettingsSchema } from '@shared/session-rag'
import { settingsStore } from '@/stores/settingsStore'
import {privacyAllowed} from '@shared/providers/definitions/models/venice/privacy'
/** Prefer an explicitly catalogued private Venice model. Never label an unknown model private. */
export function defaultRagSettings(){
  const global=settingsStore.getState().getSettings(),venice=global.providers?.venice
  const privateModel=venice?.apiKey&&venice.venice?.enabled!==false?venice.models?.find(model=>model.type==='embedding'&&model.vendorMetadata?.privacy==='private'&&privacyAllowed(model.vendorMetadata,venice.venice?.privacyFilter)):undefined
  return RagSettingsSchema.parse({ocrReasoning:'concise',indexConcurrency:2,retainImages:true,provider:global.defaultEmbeddingModel?.provider||(privateModel?'venice':undefined),model:global.defaultEmbeddingModel?.model||privateModel?.modelId,ocrProvider:global.ocrModel?.provider,ocrModel:global.ocrModel?.model,ocrVisionFallback:global.ocrVisionFallback,sttProvider:global.defaultASRModel?.provider,sttModel:global.defaultASRModel?.model})
}
