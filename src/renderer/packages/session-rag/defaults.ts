import { RagSettingsSchema } from '@shared/session-rag'
import { settingsStore } from '@/stores/settingsStore'
/** Prefer an explicitly catalogued private Venice model. Never label an unknown model private. */
export function defaultRagSettings(){
  const global=settingsStore.getState().getSettings(),venice=global.providers?.venice
  const privateModel=venice?.apiKey&&venice.venice?.enabled!==false?venice.models?.find(model=>model.type==='embedding'&&model.vendorMetadata?.privacy==='private'):undefined
  return RagSettingsSchema.parse({provider:privateModel?'venice':global.defaultEmbeddingModel?.provider,model:privateModel?.modelId||global.defaultEmbeddingModel?.model,ocrProvider:global.ocrModel?.provider,ocrModel:global.ocrModel?.model})
}
