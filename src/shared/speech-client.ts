import type { Settings } from './types'
import type { ApiRequestOptions } from './types/adapters'
import { speechBinding,speechSelection,speechPrivacyDecision,speechModelKind,type SpeechKind,type SpeechPrivacy,type SpeechCatalogModel } from './speech'

export interface SpeechContext { sessionId?:string; selected?:{provider:string;modelId:string} }
export interface SpeechProvider { id:string; apiHost:string; apiKey:string; enabled:boolean; audioEnabled:boolean }
export interface SpeechDependencies {
  settings():Settings
  provider(id:string):SpeechProvider
  privacy(context:SpeechContext):Promise<SpeechPrivacy>
  assertAccess(context:SpeechContext):Promise<void>
  request(options:ApiRequestOptions):Promise<Response>
}
export class SpeechError extends Error { constructor(message:string,readonly values:Record<string,string|number>={}){super(message)} }
const PRIVATE_BLOCK='Speech is disabled because this chat is private and the speech model is not declared private. Choose a private speech model in Default models.'
export const MAX_SPEECH_BYTES=20*1024*1024
export function speechBase(host:string){
  const url=new URL(host)
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new SpeechError('Invalid speech provider endpoint')
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  if(url.protocol!=='https:'&&!local)throw new SpeechError('Speech providers must use HTTPS, except local services')
  url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'')
  if(!url.pathname||url.pathname==='/')url.pathname='/v1'
  return url.toString().replace(/\/+$/,'')
}
async function boundedBytes(response:Response,maximum:number,signal:AbortSignal){
  const reader=response.body?.getReader();if(!reader)throw new SpeechError('The speech provider returned an empty response')
  const chunks:Uint8Array<ArrayBuffer>[]=[];let length=0
  try{while(true){signal.throwIfAborted();const result=await reader.read();if(result.done)break;length+=result.value.length;if(length>maximum)throw new SpeechError('Speech response exceeds the size limit');chunks.push(result.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;chunk.fill(0)}return bytes
}
export class SpeechClient {
  constructor(private readonly deps:SpeechDependencies){}
  private async resolve(kind:SpeechKind,context:SpeechContext){
    await this.deps.assertAccess(context)
    const settings=this.deps.settings(),selection=speechSelection(settings,kind)
    if(!selection)throw new SpeechError('Choose a global speech model in Settings → Default models first')
    const provider=this.deps.provider(selection.provider),origin=speechBase(provider.apiHost)
    if(!provider.enabled)throw new SpeechError('This speech provider is disabled')
    if(!provider.audioEnabled)throw new SpeechError('Enable audio in Venice provider settings first')
    if(!provider.apiKey&&!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))throw new SpeechError('Configure the speech provider API key first')
    const binding=await speechBinding(provider.id,origin,provider.apiKey)
    const model=settings.speechCatalog?.find(item=>item.provider===selection.provider&&item.model===selection.model&&item.kind===kind&&item.binding===binding)
    const privacy=await this.deps.privacy(context),decision=speechPrivacyDecision(privacy,model?.metadata)
    if(decision==='block')throw new SpeechError(PRIVATE_BLOCK)
    if(provider.id==='venice'&&!model)throw new SpeechError('Reload speech models after changing the Venice endpoint or API key')
    const options=settings.speechOptions??{}
    return {provider,origin,selection,model,options,decision,fingerprint:JSON.stringify([binding,selection,model,options,privacy])}
  }
  async check(kind:SpeechKind,context:SpeechContext){return this.resolve(kind,context)}
  private async authorize(kind:SpeechKind,context:SpeechContext,signal:AbortSignal,confirm:()=>Promise<boolean>){
    signal.throwIfAborted();const initial=await this.resolve(kind,context)
    if(initial.decision==='confirm'&&!await confirm())throw new DOMException('Speech cancelled','AbortError')
    signal.throwIfAborted();const current=await this.resolve(kind,context)
    if(current.fingerprint!==initial.fingerprint)throw new SpeechError('Speech settings or chat privacy changed. Review the request again.')
    return current
  }
  private async call(provider:SpeechProvider,url:string,body:RequestInit['body'],signal:AbortSignal){
    const headers:Record<string,string>={};if(provider.apiKey)headers.Authorization='Bearer '+provider.apiKey
    if(typeof body==='string')headers['Content-Type']='application/json'
    const response=await this.deps.request({url,method:'POST',body,headers,signal,retry:0,useProxy:false})
    if(!response.ok){await response.body?.cancel();throw new SpeechError('Speech request failed (HTTP {{status}}). No automatic retry was made.',{status:response.status})}
    return response
  }
  async transcribe(context:SpeechContext,file:File,signal:AbortSignal,confirm:()=>Promise<boolean>){
    if(!file.size||file.size>25*1024*1024)throw new SpeechError('Choose an audio recording up to 25 MB')
    const selected=await this.authorize('asr',context,signal,confirm)
    const form=new FormData();form.set('model',selected.selection.model);form.set('file',file);form.set('response_format','json')
    if(selected.options.language&&selected.options.language!=='auto')form.set('language',selected.options.language)
    const response=await this.call(selected.provider,selected.origin+'/audio/transcriptions',form,signal)
    const bytes=await boundedBytes(response,1024*1024,signal)
    try{
      const data=JSON.parse(new TextDecoder().decode(bytes)) as {text?:unknown}
      if(typeof data.text!=='string'||data.text.length>128000)throw new SpeechError('The speech provider returned no usable transcription')
      await this.deps.assertAccess(context);signal.throwIfAborted()
      if((await this.resolve('asr',context)).fingerprint!==selected.fingerprint)throw new SpeechError('Speech settings or chat privacy changed. Review the request again.')
      return data.text
    }finally{bytes.fill(0)}
  }
  async synthesize(context:SpeechContext,text:string,signal:AbortSignal,confirm:()=>Promise<boolean>){
    if(!text.trim()||text.length>20000)throw new SpeechError('Select a reply containing between 1 and 20,000 characters')
    const selected=await this.authorize('tts',context,signal,confirm),spec=selected.model?.metadata??{}
    const formats=Array.isArray(spec.supported_formats)?spec.supported_formats.map(String):undefined
    const format=formats?['mp3','wav','opus','ogg','aac','flac'].find(value=>formats.includes(value)):'mp3'
    if(!format)throw new SpeechError('This speech model has no supported playback format')
    const voice=selected.options.voice||String(spec.default_voice||(selected.provider.id==='openai'?'alloy':''))
    if(voice&&Array.isArray(spec.voices)&&!spec.voices.includes(voice))throw new SpeechError('Choose a voice offered by the selected speech model')
    const body:Record<string,unknown>={model:selected.selection.model,input:text,response_format:format}
    if(voice)body.voice=voice
    if(selected.options.speed!==undefined&&(selected.provider.id==='openai'||spec.supports_speed===true||spec.min_speed!==undefined))body.speed=selected.options.speed
    const response=await this.call(selected.provider,selected.origin+'/audio/speech',JSON.stringify(body),signal)
    const mime=(response.headers.get('content-type')||'').split(';')[0]
    if(!mime.startsWith('audio/')){await response.body?.cancel();throw new SpeechError('The speech provider returned an unsupported audio response')}
    const bytes=await boundedBytes(response,MAX_SPEECH_BYTES,signal)
    try{
      await this.deps.assertAccess(context);signal.throwIfAborted()
      if((await this.resolve('tts',context)).fingerprint!==selected.fingerprint)throw new SpeechError('Speech settings or chat privacy changed. Review the request again.')
      return new Blob([Uint8Array.from(bytes)],{type:mime})
    }finally{bytes.fill(0)}
  }
  async catalog(providerId:string,signal:AbortSignal):Promise<SpeechCatalogModel[]>{
    const provider=this.deps.provider(providerId),origin=speechBase(provider.apiHost)
    if(!provider.enabled)throw new SpeechError('This speech provider is disabled')
    const binding=await speechBinding(providerId,origin,provider.apiKey),headers:Record<string,string>=provider.apiKey?{Authorization:'Bearer '+provider.apiKey}:{}
    const response=await this.deps.request({url:origin+'/models'+(providerId==='venice'?'?type=all':''),method:'GET',headers,signal,retry:0,useProxy:false})
    if(!response.ok){await response.body?.cancel();throw new SpeechError('Unable to load speech models')}
    const bytes=await boundedBytes(response,8*1024*1024,signal)
    try{
      const data=JSON.parse(new TextDecoder().decode(bytes)) as {data?:{id:string;type?:string;model_spec?:Record<string,unknown>}[]}
      if(!Array.isArray(data.data))throw new SpeechError('The provider returned an invalid speech catalog')
      const result=data.data.filter(row=>typeof row.id==='string'&&!row.model_spec?.offline).flatMap(row=>{const kind=speechModelKind(row);return kind?[{provider:providerId,model:row.id,kind,name:String(row.model_spec?.name||row.id),binding,metadata:row.model_spec}]:[]}).slice(0,500)
      if(await speechBinding(providerId,speechBase(this.deps.provider(providerId).apiHost),this.deps.provider(providerId).apiKey)!==binding)throw new SpeechError('Speech settings or chat privacy changed. Review the request again.')
      return result
    }finally{bytes.fill(0)}
  }
}
