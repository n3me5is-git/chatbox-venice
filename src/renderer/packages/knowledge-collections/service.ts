import {knowledgeJson} from './llm'
import {knowledgeExtractionInstruction} from '@shared/knowledge-augmentation-engine'
import {rerankWithLLM} from './llm-rerank'
import platform from '@/platform'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { extractRagSource } from '@/packages/session-rag/extract'
import { ragProvider,requestRagEmbeddings,multimodalEmbedding,embeddingSpaceIdentity,embeddingSpaceDescriptor } from '@/packages/session-rag/embeddings'
import { requestProtectedAccess } from '@/components/security/requestUnlock'
import type { RagSettings } from '@shared/session-rag'
import { KnowledgeCollections } from './store'
import {rerankCollection} from './rerank'
import {settingsStore} from '@/stores/settingsStore'
export function validateCollectionSettings(settings:RagSettings){ragProvider(settings);if((settings.images||settings.audio)&&!multimodalEmbedding(settings.provider,settings.model))throw Error('This embedding model accepts text only');if(settings.ocr&&(!settings.ocrProvider||!settings.ocrModel))throw Error('Choose an OCR model first');if(settings.stt&&(!settings.sttProvider||!settings.sttModel))throw Error('Choose a global STT model before enabling transcription')}
let instance:KnowledgeCollections|undefined
const current=()=>instance ||= new KnowledgeCollections(vaultRuntimeFor(platform),{extract:extractRagSource,embed:requestRagEmbeddings,validate:validateCollectionSettings,embeddingIdentity:embeddingSpaceIdentity,unlock:requestProtectedAccess,rerank:rerankCollection,llmRerank:rerankWithLLM,analyze:async(text,cfg,signal)=>{if(!cfg.model)throw Error('Choose a knowledge extraction model first');return knowledgeJson(cfg.model,knowledgeExtractionInstruction,{text},signal)},analysisAuthority:cfg=>JSON.stringify(cfg.model?settingsStore.getState().getSettings().providers?.[cfg.model.provider]:null),authority:settings=>{const provider=ragProvider(settings);return JSON.stringify([embeddingSpaceDescriptor(settings),provider.host,provider.saved.apiKey,settings.ocr?settingsStore.getState().getSettings().providers?.[settings.ocrProvider]:null,settings.stt?settingsStore.getState().getSettings().providers?.[settings.sttProvider]:null,settings.stt?settingsStore.getState().getSettings().speechCatalog:null])}})
// Importing a page must not initialize native key storage before platform setup.
export const knowledgeCollections=new Proxy({} as KnowledgeCollections,{get(_target,key){const value=Reflect.get(current(),key);return typeof value==='function'?value.bind(current()):value}})
