import type { ProviderModelInfo, SessionSettings } from '@shared/types'
import type { SharedControls, SharedControlPatch } from '@shared/collaboration'
import { SharedControlPatchSchema } from '@shared/collaboration'
import { getReasoningControlOptions, getReasoningControlLevel, getReasoningProviderOptions, resolveReasoningProviderOptions, setReasoningProviderOptionsForModel } from '@shared/utils/reasoning-control'
import { resolveVeniceSettings, type VeniceOptions } from '@shared/providers/definitions/models/venice/options'

export function sharedControls(settings:SessionSettings,model:ProviderModelInfo|null,webBrowsing:boolean,venice:VeniceOptions={},subscriptionDefault=false):Omit<SharedControls,'revision'>{
  const options=resolveReasoningProviderOptions(settings,settings.provider,settings.modelId)
  const resolved=resolveVeniceSettings(venice,model?.veniceProfile,settings.veniceProfile,settings.veniceSecurity)
  return {model:(model?.nickname||settings.modelId||'').slice(0,240),thinking:getReasoningControlLevel(settings.provider,model,options),thinkingOptions:getReasoningControlOptions(settings.provider,model).map(item=>item.level),webBrowsing,
    ...(settings.provider==='venice'?{venice:{webSearch:resolved.webSearch??'off',webSearchEnabled:resolved.webSearchEnabled!==false,searchProvider:resolved.searchProvider??'native',searchToolMode:resolved.searchToolMode??'selected',webCitations:resolved.webCitations!==false,webScraping:!!resolved.webScraping,xSearch:!!resolved.xSearch}}:{}),
    ...(settings.provider==='openai-sub-unofficial'?{subscriptionWebSearch:settings.subscriptionWebSearch??subscriptionDefault}:{})}
}

/** Build only a narrow session patch; remote callers cannot replace the host's settings. */
export function sharedSettingsPatch(settings:SessionSettings,model:ProviderModelInfo|null,controls:SharedControls,raw:SharedControlPatch):Partial<SessionSettings>{
  const patch=SharedControlPatchSchema.parse(raw),next:Partial<SessionSettings>={}
  if(patch.thinking!==undefined){
    if(!controls.thinkingOptions.includes(patch.thinking))throw Error('This thinking level is unavailable on the host model')
    Object.assign(next,setReasoningProviderOptionsForModel(settings,settings.provider,settings.modelId,getReasoningProviderOptions(settings.provider,model,patch.thinking,resolveReasoningProviderOptions(settings,settings.provider,settings.modelId))))
  }
  if(patch.webBrowsing!==undefined)next.webBrowsing=patch.webBrowsing
  if(patch.venice){if(!controls.venice)throw Error('Venice search is unavailable on the host model');next.veniceProfile={...settings.veniceProfile,...patch.venice}}
  if(patch.subscriptionWebSearch!==undefined){if(controls.subscriptionWebSearch===undefined)throw Error('ChatGPT search is unavailable on the host model');next.subscriptionWebSearch=patch.subscriptionWebSearch}
  return next
}
