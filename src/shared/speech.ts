import type { SessionSettings,Settings } from './types'
import { veniceSessionTextPrivacy } from '@chatbox/core/domain/settings/venice-privacy'

export type SpeechKind='asr'|'tts'
export type SpeechCatalogModel=NonNullable<Settings['speechCatalog']>[number]
export type SpeechPrivacy='standard'|'private'|'e2ee'
export function isPrivateModel(metadata?:Record<string,unknown>){
  const caps=metadata?.capabilities as Record<string,unknown>|undefined
  return metadata?.privacy==='private'||caps?.supportsTeeAttestation===true||caps?.supportsE2EE===true
}
export function chatSpeechPrivacy(settings:Settings,session?:SessionSettings,selected?:{provider:string;modelId:string}):SpeechPrivacy{
  const provider=selected?.provider||session?.provider||settings.defaultChatModel?.provider
  const model=selected?.modelId||session?.modelId||settings.defaultChatModel?.model
  const saved=settings.providers?.[provider||''],metadata=[...(saved?.catalogModels??[]),...(saved?.models??[])].find(item=>item.modelId===model)?.vendorMetadata
  const effective={...session,provider,modelId:model} as SessionSettings
  const transport=veniceSessionTextPrivacy(effective,settings),caps=metadata?.capabilities as Record<string,unknown>|undefined
  if(transport==='e2ee'||caps?.supportsE2EE===true)return 'e2ee'
  if(transport==='tee'||isPrivateModel(metadata)||provider==='venice'&&saved?.venice?.privacyFilter&&saved.venice.privacyFilter!=='all')return 'private'
  return 'standard'
}
/** Audio endpoints do not implement the text E2EE handshake, even for a catalog entry advertising it. */
export function speechPrivacyDecision(chat:SpeechPrivacy,metadata?:Record<string,unknown>):'allow'|'confirm'|'block'{
  if(chat==='standard')return 'allow'
  if(!isPrivateModel(metadata))return 'block'
  return chat==='e2ee'?'confirm':'allow'
}
export function speechSelection(settings:Settings,kind:SpeechKind){return kind==='asr'?settings.defaultASRModel:settings.defaultTTSModel}
export function speechModelKind(model:{id:string;type?:string}):SpeechKind|undefined{
  if(model.type==='tts'||model.type==='asr')return model.type
  if(model.type)return undefined
  if(/(?:^|\/)(?:whisper(?:[-/]|$)|gpt-[\w.-]*transcribe)/i.test(model.id))return 'asr'
  if(/(?:^|\/)(?:tts(?:[-/]|$)|gpt-[\w.-]*tts)/i.test(model.id))return 'tts'
}
export async function speechBinding(provider:string,origin:string,key:string){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([provider,origin,key])))
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')
}
