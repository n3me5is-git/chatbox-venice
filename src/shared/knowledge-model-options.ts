import type {ModelProvider,ProviderModelInfo} from './types'
import {getReasoningControlOptions,getReasoningProviderOptions,setReasoningProviderOptionsForModel} from './utils/reasoning-control'
/** Explicit role-local policy; never modifies persisted chat/provider settings. */
export function knowledgeModelOptions(provider:string,model:string,info:ProviderModelInfo|undefined,mode:'auto'|'concise',input:'text'|'image'='text'){
 // Live Venice GLM 5.3 Flash rejects image input with disable_thinking=true
 // (HTTP 400 Invalid image or video input), but accepts the same image in Auto.
 if(mode!=='concise'||input==='image'&&provider==='venice'&&model==='z-ai-glm-5-3-flash')return {}
 const levels=getReasoningControlOptions(provider as ModelProvider,info),level=levels.some(option=>option.level==='off')?'off':levels.some(option=>option.level==='low')?'low':'default',options=getReasoningProviderOptions(provider as ModelProvider,info,level)
 return options?setReasoningProviderOptionsForModel(undefined,provider,model,options):{}
}
