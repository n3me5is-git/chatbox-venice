import { SystemProviders } from '@shared/defaults'
import { ModelProviderType } from '@shared/types'
import { normalizeOpenAIApiHostAndPath } from '@shared/utils/llm_utils'
import type { RagSettings } from '@shared/session-rag'
import type { RagInput } from '@shared/session-rag-engine'
import { settingsStore } from '@/stores/settingsStore'
import { apiRequest } from '@/utils/request'
import {requireModelPrivacy} from '@shared/providers/definitions/models/venice/privacy'
export function multimodalEmbedding(provider:string,model:string){const custom=settingsStore.getState().getSettings().customProviders?.find(item=>item.id===provider);return (provider==='gemini'||custom?.type===ModelProviderType.Gemini)&&/^gemini-embedding-2(?:$|-)/.test(model)}
export function ragProvider(settings:RagSettings){const global=settingsStore.getState().getSettings(),definition=[...SystemProviders(),...(global.customProviders||[])].find(p=>p.id===settings.provider),saved=global.providers?.[settings.provider];if(!definition||!saved?.apiKey||!settings.model||settings.provider==='venice'&&saved.venice?.enabled===false)throw Error('Configure the selected embedding provider first');if(![ModelProviderType.OpenAI,ModelProviderType.Gemini].includes(definition.type))throw Error('Choose an OpenAI-compatible or Gemini embedding provider');if(settings.provider==='venice')requireModelPrivacy(saved.models?.find(model=>model.modelId===settings.model)?.vendorMetadata,saved.venice?.privacyFilter);return {definition,saved,host:saved.apiHost||definition.defaultSettings?.apiHost||''}}
const encode=(data:Uint8Array)=>{let value='';for(const byte of data)value+=String.fromCharCode(byte);return btoa(value)}
async function mediaPart(input:RagInput,signal:AbortSignal){
  if(!input.data||!input.mime)throw Error('Invalid embedding input')
  if(input.data.length>8*1024*1024)throw Error('Embedding media must not exceed 8 MB')
  if(input.mime.startsWith('image/')&&!['image/png','image/jpeg'].includes(input.mime)){const {getImageBase64AndResize}=await import('@/packages/pic_utils');const url=await getImageBase64AndResize(new File([Uint8Array.from(input.data)],'reference',{type:input.mime}),{outputType:'image/jpeg',quality:0.9});return {inlineData:{mimeType:'image/jpeg',data:url.slice(url.indexOf(',')+1)}}}
  if(input.mime.startsWith('audio/')){const {voiceFileDuration}=await import('@/packages/voice-file');const duration=await voiceFileDuration(new File([Uint8Array.from(input.data)],'audio',{type:input.mime}),signal);if(duration>60)throw Error('Embedding audio must not exceed 60 seconds')}
  return {inlineData:{mimeType:input.mime,data:encode(input.data)}}
}
export async function requestRagEmbeddings(inputs:RagInput[],query:boolean,settings:RagSettings,signal:AbortSignal){
  const {definition,saved,host}=ragProvider(settings)
  try{
    if(definition.type===ModelProviderType.Gemini){
      const vectors:number[][]=[]
      for(const input of inputs){signal.throwIfAborted();if(input.data&&!multimodalEmbedding(settings.provider,settings.model))throw Error('This embedding model accepts text only')
        const part=input.text!==undefined?{text:multimodalEmbedding(settings.provider,settings.model)?(query?'Represent this query for retrieving relevant documents:\n':'Represent this document for retrieval:\n')+input.text:input.text}:await mediaPart(input,signal)
        const body:Record<string,unknown>={content:{parts:[part]}}
        if(!multimodalEmbedding(settings.provider,settings.model))body.taskType=query?'RETRIEVAL_QUERY':'RETRIEVAL_DOCUMENT'
        if(settings.dimensions)body.outputDimensionality=settings.dimensions
        const base=(host||'https://generativelanguage.googleapis.com').replace(/\/$/,'').replace(/\/v1beta$/,'')
        const response=await apiRequest.post(base+'/v1beta/models/'+encodeURIComponent(settings.model)+':embedContent',{'x-goog-api-key':saved.apiKey!,'Content-Type':'application/json'},JSON.stringify(body),{signal,retry:0});const result=await response.json();vectors.push(result.embedding?.values)
      }
      return vectors
    }
    if(inputs.some(input=>input.text===undefined))throw Error('This embedding model accepts text only')
    const {apiHost,apiPath}=normalizeOpenAIApiHostAndPath({apiHost:host,apiPath:'/embeddings'},{apiPath:'/embeddings'})
    const response=await apiRequest.post(apiHost+apiPath,{Authorization:'Bearer '+saved.apiKey,'Content-Type':'application/json'},JSON.stringify({model:settings.model,input:inputs.map(input=>input.text),encoding_format:'float',...(settings.dimensions?{dimensions:settings.dimensions}:{})}),{signal,retry:0})
    const result=await response.json();if(!Array.isArray(result.data)||result.data.length!==inputs.length)throw Error('Incomplete embedding response')
    const rows=[...result.data].sort((a,b)=>a.index-b.index);if(rows.some((row,index)=>row.index!==index))throw Error('Invalid embedding response order');return rows.map(row=>row.embedding as number[])
  }catch(error){throw Object.assign(error instanceof Error?error:Error(String(error)),{fatal:true})}
}
