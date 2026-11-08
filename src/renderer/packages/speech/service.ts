import { SystemProviders } from '@shared/defaults'
import { ModelProviderType,SessionSettingsSchema } from '@shared/types'
import { chatSpeechPrivacy } from '@shared/speech'
import { SpeechClient,SpeechError,type SpeechContext } from '@shared/speech-client'
import { createModelDependencies } from '@/adapters'
import { rendererApplication } from '@/app/renderer-application'
import { settingsStore } from '@/stores/settingsStore'
import { getSessionSettings } from '@/stores/session/session-settings'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'

export function speechProviders(){
  const settings=settingsStore.getState().getSettings()
  return [...SystemProviders(),...(settings.customProviders??[])].filter(provider=>provider.type===ModelProviderType.OpenAI&&(['venice','openai','groq'].includes(provider.id)||provider.isCustom)&&(settings.providers?.[provider.id]?.apiKey||provider.isCustom)&&!(provider.id==='venice'&&settings.providers?.venice?.venice?.enabled===false))
}
async function assertAccess(context:SpeechContext){
  if(!context.sessionId)return
  await vaultRuntimeFor(platform).projects.assertSession(context.sessionId)
  if(!await rendererApplication.sessions.getSessionHeader(context.sessionId))throw new SpeechError('This chat is no longer available')
}
export const speechClient=new SpeechClient({
  settings:()=>settingsStore.getState().getSettings(),
  provider:id=>{
    const settings=settingsStore.getState().getSettings(),definition=[...SystemProviders(),...(settings.customProviders??[])].find(provider=>provider.id===id)
    if(!definition||definition.type!==ModelProviderType.OpenAI||!(['venice','openai','groq'].includes(id)||definition.isCustom))throw new SpeechError('Choose an OpenAI-compatible speech provider')
    const saved=settings.providers?.[id]
    return {id,apiHost:saved?.apiHost||definition.defaultSettings?.apiHost||'',apiKey:saved?.apiKey||'',enabled:id!=='venice'||saved?.venice?.enabled!==false,audioEnabled:id!=='venice'||saved?.venice?.audioEnabled===true}
  },
  privacy:async context=>{
    const settings=settingsStore.getState().getSettings(),session=context.sessionId?await getSessionSettings(context.sessionId):SessionSettingsSchema.parse(settings)
    return chatSpeechPrivacy(settings,session,context.selected)
  },assertAccess,
  request:async options=>(await createModelDependencies()).request.apiRequest(options),
})
