import {tool} from 'ai'
import {z} from 'zod'
import type {LocalMCPGrant} from '@shared/local-mcp'
import {ModelProviderEnum} from '@shared/types'
import {assertImageToolOptions,assertMediaToolOptions} from '@shared/providers/definitions/models/venice/call-options'
import {privacyAllowed} from '@shared/providers/definitions/models/venice/privacy'
import {supportsMediaKind} from '@shared/providers/definitions/models/venice/media-capabilities'
import {providerImageModelsQueryOptions} from '@/packages/image-model-catalog'
import {queryClient} from '@/stores/queryClient'
import {veniceConfiguration,veniceMediaService} from '@/packages/venice/service'
import {getImageGenerationService} from '@/stores/imageGenerationActions'
import {sessionFiles} from '@/packages/session-resources/files'
import {listSessionResources,readSessionResource} from '@/packages/session-resources/service'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import platform from '@/platform'
import {requestExternalModelApproval} from './model-approval'
import {temporaryMCPEntries,mutateTemporaryMCPEntries} from './temporary'
const kinds=['image','speech','transcription','video','music','sound-effects','voice-conversion'] as const
const references=z.object({image_url:z.string().optional(),end_image_url:z.string().optional(),reference_image_urls:z.array(z.string()).max(16).optional(),video_url:z.string().optional(),reference_video_urls:z.array(z.string()).max(8).optional(),reference_audio_urls:z.array(z.string()).max(8).optional(),audio_url:z.string().optional()}).strict()
async function file(id:string,path:string,signal:AbortSignal){
  const item=(await listSessionResources(id,signal)).items.find(item=>item.path===path);if(!item)throw Error('Input file is not in this workspace')
  if(item.bytes!==undefined&&item.bytes>25*1024*1024)throw Error('Studio input file exceeds 25 MB')
  const vault=vaultRuntimeFor(platform),header=item.key?await vault.assets.header(item.key):null
  if(header){if(header.bytes>25*1024*1024)throw Error('Studio input file exceeds 25 MB');const chunks:Uint8Array<ArrayBuffer>[]=[];try{for await(const chunk of vault.assets.read(item.key!)){signal.throwIfAborted();await vault.projects.assertSession(id);chunks.push(chunk)}return new File(chunks,item.name,{type:item.mime})}finally{for(const bytes of chunks)bytes.fill(0)}}
  const {bytes}=await readSessionResource(id,item);try{return new File([bytes],item.name,{type:item.mime})}finally{bytes.fill(0)}
}
async function dataURL(input:File){const bytes=new Uint8Array(await input.arrayBuffer());try{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+input.type+';base64,'+btoa(text)}finally{bytes.fill(0)}}
export function applicationStudioTool(grant:LocalMCPGrant,signal:AbortSignal,context:(id?:string)=>Promise<string>,assert:(id:string)=>Promise<unknown>,unique:(id:string,input:unknown,work:()=>Promise<unknown>)=>Promise<unknown>){
  return tool({description:'Use the same Venice Studio generation pipelines directly, without an app conversation. Catalog shows exact model capabilities and pricing. Supports images with reference paths, all media kinds, transcription, voice conversion and cloning when the selected model/API supports them. Upload inputs with app_upload; references are workspace paths, not OS paths. Text E2EE does not encrypt these media APIs. Paid operations require request_id and app approval unless this endpoint has automatic Studio approval. Voice clones may expire remotely rather than support immediate remote deletion.',inputSchema:z.object({sessionId:z.string().optional(),action:z.enum(['catalog','quote','generate','status','wait','pause','resume','cleanup_remote','voices','clone_voice','remove_voice']),kind:z.enum(kinds).optional(),model:z.string().max(256).optional(),prompt:z.string().max(100000).default(''),options:z.record(z.string(),z.unknown()).default({}),count:z.number().int().min(1).max(4).default(1),aspectRatio:z.string().max(40).default('auto'),referencePaths:z.array(z.string().max(512)).max(16).default([]),references:references.optional(),filePath:z.string().max(512).optional(),id:z.string().max(256).optional(),timeout_seconds:z.number().int().min(0).max(45).default(30),request_id:z.string().min(1).max(128).optional()}).strict(),execute:async input=>{
    if(grant.application?.providers&&!grant.application.providers.includes('venice'))throw Error('Venice is not granted to this endpoint')
    const id=await context(input.sessionId);await assert(id)
    const config=veniceConfiguration();if(config.options.enabled===false||!config.apiKey)throw Error('Configure and enable Venice first')
    const images=async()=>(await queryClient.fetchQuery(providerImageModelsQueryOptions(ModelProviderEnum.Venice,config))).filter(model=>privacyAllowed(model.vendorMetadata,config.options.privacyFilter))
    const media=async()=>(await veniceMediaService.catalog()).filter(model=>privacyAllowed(model.model_spec,config.options.privacyFilter)&&(config.options.showOtherModels||config.options.mediaModelIds===undefined||config.options.mediaModelIds.includes(model.id)))
    if(input.action==='catalog')return {images:!input.kind||input.kind==='image'?await images():[],media:input.kind==='image'?[]:(await media()).filter(model=>!input.kind||supportsMediaKind(model,input.kind as Exclude<typeof input.kind,'image'>))}
    const approve=async()=>{
      const review=JSON.stringify({action:input.action,kind:input.kind,model:input.model,prompt:input.prompt,options:input.options,referencePaths:input.referencePaths,references:input.references,filePath:input.filePath,count:input.count,aspectRatio:input.aspectRatio})
      if(review.length>64000)throw Error('Use app_upload for large binary references instead of embedding them in options')
      if(!grant.application!.automaticStudio&&!await requestExternalModelApproval(grant,{provider:'venice',modelId:input.model||'Venice Studio',messages:[{role:'user',content:'External Studio operation. Images/audio/video are not E2EE. Voice clones may remain until remote expiry.\n'+review}],maxOutputTokens:0},signal))throw Error('Studio request was not approved')
      await assert(id);const current=veniceConfiguration();if(current.apiKey!==config.apiKey||current.apiHost!==config.apiHost||JSON.stringify(current.options)!==JSON.stringify(config.options))throw Error('Venice configuration changed; review a new request')
    }
    const record=async()=>{const row=(await veniceMediaService.list()).find(row=>row.id===input.id&&row.sessionId===id);if(!row)throw Error('Generation is not in this workspace');return row}
    const summary=(row:Awaited<ReturnType<typeof record>>)=>({id:row.id,kind:row.kind,model:row.model,status:row.status,text:row.text,error:row.error,localAvailable:!!row.blobKey,remoteCleaned:row.remoteCleaned})
    if(input.action==='voices'){const owned=(await temporaryMCPEntries()).find(item=>item.id===id)?.voices||[];return (await veniceMediaService.listVoices(input.model)).filter(voice=>owned.includes(voice.id)).map(({id,model,name,expiresAt})=>({id,model,name,expiresAt}))}
    if(['generate','clone_voice','resume','remove_voice','cleanup_remote'].includes(input.action)&&!input.request_id)throw Error('Paid or destructive operations require a stable request_id')
    const work=async()=>{
      if(input.action==='remove_voice'){
        const entry=(await temporaryMCPEntries()).find(item=>item.id===id);if(!input.id||!entry?.voices?.includes(input.id))throw Error('Voice handle is not owned by this endpoint')
        await approve();await veniceMediaService.removeVoice(input.id);await mutateTemporaryMCPEntries(items=>items.map(item=>item.id===id?{...item,voices:item.voices?.filter(voice=>voice!==input.id)}:item));return {removedLocally:true,remote:'Expires according to Venice voice-cloning retention; no immediate deletion API is documented'}
      }
      if(input.action==='clone_voice'){
        if(!input.model||!input.filePath)throw Error('Choose a model and an uploaded sample')
        // Keep handles bound to temporary contexts so a router never lists an existing personal voice.
        if(!(await temporaryMCPEntries()).some(item=>item.id===id))throw Error('Create a temporary workspace for voice cloning')
        await media();await approve();const voice=await veniceMediaService.createVoice(input.model,await file(id,input.filePath,signal),input.prompt,signal)
        await mutateTemporaryMCPEntries(items=>items.map(item=>item.id===id?{...item,voices:[...(item.voices||[]),voice.id]}:item));return {id:voice.id,model:voice.model,name:voice.name,expiresAt:voice.expiresAt,remote:'Expires according to Venice retention; local cleanup does not remove the remote voice immediately'}
      }
      if(input.action==='generate'||input.action==='quote'){
        if(!input.kind||!input.model)throw Error('Select kind and exact model ID from catalog')
        const options={...input.options};assertMediaToolOptions(input.kind,options)
        if(input.kind==='image'){
          if(input.action==='quote')throw Error('Image pricing is in the catalog; no quote endpoint is used')
          assertImageToolOptions(options)
          if(!(await images()).some(model=>model.modelId===input.model))throw Error('Image model is not available')
          const refs=await Promise.all(input.referencePaths.map(async path=>dataURL(await file(id,path,signal))))
          await approve()
          const handle=await getImageGenerationService().start({prompt:input.prompt,model:{provider:'venice',modelId:input.model,extraBody:options},imageGenerateNum:input.count,aspectRatio:input.aspectRatio,referenceImages:refs,protection:await vaultRuntimeFor(platform).projects.sessionScope(id)||undefined,source:{type:'chatbox_cli',sessionId:id,toolCallId:'studio:'+input.request_id}})
          void handle.completion.catch(()=>{})
          return {id:handle.recordId,kind:'image',status:'pending',background:true}
        }
        if(!(await media()).some(model=>model.id===input.model&&supportsMediaKind(model,input.kind as Exclude<typeof input.kind,'image'>)))throw Error('Media model is not available for this category')
        let size=0
        for(const [key,paths]of Object.entries(input.references||{})){
          if(key in options)throw Error('Specify each reference once')
          const values=await Promise.all((Array.isArray(paths)?paths:[paths]).map(async path=>{const source=await file(id,path!,signal);size+=source.size;if(size>24*1024*1024)throw Error('Combined reference files exceed 24 MB');return dataURL(source)}));options[key]=Array.isArray(paths)?values:values[0]
        }
        const source=input.filePath?await file(id,input.filePath,signal):undefined
        const request={kind:input.kind,model:input.model,prompt:input.prompt,options,file:source,sessionId:id,signal,protection:await vaultRuntimeFor(platform).projects.sessionScope(id)||undefined}
        if(input.action==='quote')return veniceMediaService.quote(request)
        await approve();return summary(await veniceMediaService.start(request))
      }
      if(input.kind==='image'){
        if(!['status','wait'].includes(input.action))throw Error('Use image status to inspect this existing generation')
        const row=await getImageGenerationService().getRecord(input.id||'');if(!row||row.source?.sessionId!==id)throw Error('Image is not in this workspace');return {id:row.id,status:row.status,error:row.error,count:row.generatedImages.length}
      }
      const row=await record()
      if(input.action==='wait')await veniceMediaService.waitFor(row.id,input.timeout_seconds*1000,signal)
      else if(input.action==='pause')await veniceMediaService.pause(row.id)
      else if(input.action==='resume'){await approve();await veniceMediaService.resume(row.id)}
      else if(input.action==='cleanup_remote'){await approve();await veniceMediaService.cleanup(row.id)}
      await assert(id);return summary(await record())
    }
    return input.request_id?unique('studio:'+input.request_id,input,work):work()
  }})
}
