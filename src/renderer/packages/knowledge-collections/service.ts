import platform from '@/platform'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { extractRagSource } from '@/packages/session-rag/extract'
import { ragProvider,requestRagEmbeddings,multimodalEmbedding } from '@/packages/session-rag/embeddings'
import { requestProtectedAccess } from '@/components/security/requestUnlock'
import type { RagSettings } from '@shared/session-rag'
import { KnowledgeCollections } from './store'
import {rerankCollection} from './rerank'
export function validateCollectionSettings(settings:RagSettings){ragProvider(settings);if((settings.images||settings.audio)&&!multimodalEmbedding(settings.provider,settings.model))throw Error('This embedding model accepts text only');if(settings.ocr&&(!settings.ocrProvider||!settings.ocrModel))throw Error('Choose an OCR model first')}
let instance:KnowledgeCollections|undefined
const current=()=>instance ||= new KnowledgeCollections(vaultRuntimeFor(platform),{extract:extractRagSource,embed:requestRagEmbeddings,validate:validateCollectionSettings,unlock:requestProtectedAccess,rerank:rerankCollection})
// Importing a page must not initialize native key storage before platform setup.
export const knowledgeCollections=new Proxy({} as KnowledgeCollections,{get(_target,key){const value=Reflect.get(current(),key);return typeof value==='function'?value.bind(current()):value}})
