import {SpeechClient} from '@shared/speech-client'
import {SystemProviders} from '@shared/defaults'
import {ModelProviderType} from '@shared/types'
import type {RagSettings} from '@shared/session-rag'
import {requireModelPrivacy} from '@shared/providers/definitions/models/venice/privacy'
import {settingsStore} from '@/stores/settingsStore'
import {createModelDependencies} from '@/adapters'
/** Collection consent is independent from chat speech. Selection is frozen per
 * collection, never by mutating the user's global speech settings. */
export async function transcribeKnowledgeAudio(file:File,cfg:RagSettings,signal:AbortSignal){
 if(!cfg.stt||!cfg.sttProvider||!cfg.sttModel)throw Error('Choose a global STT model before enabling transcription')
 const client=new SpeechClient({settings:()=>({...settingsStore.getState().getSettings(),defaultASRModel:{provider:cfg.sttProvider,model:cfg.sttModel}}),provider:id=>{
  const global=settingsStore.getState().getSettings(),definition=[...SystemProviders(),...global.customProviders||[]].find(item=>item.id===id),saved=global.providers?.[id]
  if(!definition||definition.type!==ModelProviderType.OpenAI||!(['venice','openai','groq'].includes(id)||definition.isCustom))throw Error('Choose an OpenAI-compatible speech provider')
  if(id==='venice')requireModelPrivacy(global.speechCatalog?.find(item=>item.provider===id&&item.model===cfg.sttModel&&item.kind==='asr')?.metadata,saved?.venice?.privacyFilter)
  return {id,apiHost:saved?.apiHost||definition.defaultSettings?.apiHost||'',apiKey:saved?.apiKey||'',enabled:id!=='venice'||saved?.venice?.enabled!==false,audioEnabled:id!=='venice'||saved?.venice?.audioEnabled===true}
 },privacy:async()=> 'standard',assertAccess:async()=>signal.throwIfAborted(),request:async options=>(await createModelDependencies()).request.apiRequest(options)})
 return await client.transcribe({},file,signal,async()=>true)
}
