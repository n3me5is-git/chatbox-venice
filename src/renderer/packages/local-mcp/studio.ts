import {tool} from 'ai'
import {z} from 'zod'
import {localMCPBackgroundAllowed,localMCPObservation,type LocalMCPGrant} from '@shared/local-mcp'
import {ModelProviderEnum} from '@shared/types'
import {assertImageToolOptions,assertMediaToolOptions} from '@shared/providers/definitions/models/venice/call-options'
import {privacyAllowed} from '@shared/providers/definitions/models/venice/privacy'
import {audioQueueCapabilities,mediaCategory,supportsMediaKind,validateAudioQuote,validateMediaRequest} from '@shared/providers/definitions/models/venice/media-capabilities'
import {mediaEnabled} from '@shared/providers/definitions/models/venice/media'
import {buildVeniceImageRequest} from '@shared/providers/definitions/models/venice/image-request'
import {voiceFileDuration,validateVoiceDuration} from '@/packages/voice-file'
import {describeStudioImage,describeStudioMedia,studioKinds,studioWorkflow,type StudioKind} from './studio-contract'
import {providerImageModelsQueryOptions} from '@/packages/image-model-catalog'
import {queryClient} from '@/stores/queryClient'
import {veniceConfiguration,veniceMediaService} from '@/packages/venice/service'
import {getImageGenerationService} from '@/stores/imageGenerationActions'
import {sessionFiles} from '@/packages/session-resources/files'
import {listSessionResources,readSessionResource} from '@/packages/session-resources/service'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import platform from '@/platform'
import {requestExternalModelApproval} from './model-approval'
import {temporaryMCPEntries,mutateTemporaryMCPEntries,registerTemporaryMCPImage} from './temporary'
function studioCatalog(grant: LocalMCPGrant, signal: AbortSignal, locked = false) {
  if (grant.application?.providers && !grant.application.providers.includes('venice')) throw Error('Venice is not granted to this endpoint')
  const config = veniceConfiguration()
  if (config.options.enabled === false || !config.apiKey) throw Error('Configure and enable Venice first')
  const images = async () => {
    const rows = await queryClient.fetchQuery(providerImageModelsQueryOptions(ModelProviderEnum.Venice, {
      apiKey: config.apiKey, apiHost: config.apiHost, venice: config.options,
    }))
    signal.throwIfAborted()
    return rows.filter(model => privacyAllowed(model.vendorMetadata, config.options.privacyFilter))
  }
  const media = async () => (await veniceMediaService.catalog({ signal, refreshCache: !locked })).filter(model =>
    privacyAllowed(model.model_spec, config.options.privacyFilter)
    && (config.options.showOtherModels || config.options.mediaModelIds === undefined || config.options.mediaModelIds.includes(model.id)))
  const list = async (kind?: StudioKind, modelId?: string) => ({
    images: !kind || kind === 'image' ? (await images()).filter(model => !modelId || model.modelId === modelId) : [],
    media: kind === 'image' ? [] : (await media()).filter(model => (!kind || supportsMediaKind(model, kind)) && (!modelId || model.id === modelId)),
    workflow: studioWorkflow,
  })
  const describe = async (kind: StudioKind, modelId: string) => {
    const rows = await list(kind, modelId)
    if (kind === 'image' && rows.images[0]) return describeStudioImage(rows.images[0])
    if (kind !== 'image' && rows.media[0]) return describeStudioMedia(kind, rows.media[0], mediaEnabled(kind, config.options))
    throw Error('No Studio model with this ID is available in the selected kind. Read the catalog first.')
  }
  return { config, images, media, list, describe }
}

export function lockedStudioCatalogTools(grant: LocalMCPGrant, signal: AbortSignal) {
  const catalog = () => studioCatalog(grant, signal, true)
  const legacyCatalog = () => {
    if (veniceConfiguration().options.chatToolsEnabled === false) throw Error('Venice chat media tools are disabled')
    return catalog()
  }
  return {
    venice_image: tool({
      description: 'List Venice image generation and editing models while Chatbox is locked.',
      inputSchema: z.object({ action: z.literal('models') }).strict(),
      execute: async () => (await legacyCatalog().images()).map(row => ({ modelId: row.modelId, name: row.displayName, capabilities: row.capabilities, metadata: row.vendorMetadata })),
    }),
    venice_media: tool({
      description: 'List Venice media models while Chatbox is locked. Supply a model ID for the full model specification.',
      inputSchema: z.object({ action: z.literal('catalog'), kind: z.enum(['speech', 'video', 'music', 'sound-effects']).optional(), model: z.string().optional() }).strict(),
      execute: async input => {
        const visible = (await legacyCatalog().media()).filter(row => row.model_spec?.voice_changer !== true
          && ['tts', 'asr', 'video', 'music'].includes(row.type)
          && (!input.kind || supportsMediaKind(row, input.kind)) && (!input.model || row.id === input.model))
        return input.model ? visible : visible.map(row => ({ id: row.id, type: row.type, kind: mediaCategory(row), name: row.model_spec?.name, privacy: row.model_spec?.privacy }))
      },
    }),
  }
}

const references=z.object({image_url:z.string().optional(),end_image_url:z.string().optional(),reference_image_urls:z.array(z.string()).max(16).optional(),video_url:z.string().optional(),reference_video_urls:z.array(z.string()).max(8).optional(),reference_audio_urls:z.array(z.string()).max(8).optional(),audio_url:z.string().optional()}).strict()
const imageIsRunning = (status: string) => status === 'pending' || status === 'generating'
function waitForImagePoll(ms: number, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}
async function file(grant:LocalMCPGrant,id:string,path:string,signal:AbortSignal){
  if (!grant.permissions.readFiles) throw Error('Reading workspace input files is not allowed by this endpoint')
  const item=(await listSessionResources(id,signal)).items.find(item=>item.path===path);if(!item)throw Error('Input file is not in this workspace')
  if(item.bytes!==undefined&&item.bytes>25*1024*1024)throw Error('Studio input file exceeds 25 MB')
  const vault=vaultRuntimeFor(platform),header=item.key?await vault.assets.header(item.key):null
  if(header){if(header.bytes>25*1024*1024)throw Error('Studio input file exceeds 25 MB');const chunks:Uint8Array<ArrayBuffer>[]=[];const type=item.origin==='image'?(await vault.assets.info(header)).mime:item.mime;try{for await(const chunk of vault.assets.read(item.key!)){signal.throwIfAborted();await vault.projects.assertSession(id);chunks.push(chunk)}return new File(chunks,item.name,{type})}finally{for(const bytes of chunks)bytes.fill(0)}}
  const {bytes}=await readSessionResource(id,item);try{return new File([Uint8Array.from(bytes)],item.name,{type:item.mime})}finally{bytes.fill(0)}
}
async function dataURL(input:File){const bytes=new Uint8Array(await input.arrayBuffer());try{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+input.type+';base64,'+btoa(text)}finally{bytes.fill(0)}}
export function applicationStudioTool(grant:LocalMCPGrant,signal:AbortSignal,context:(id?:string)=>Promise<string>,assert:(id:string)=>Promise<unknown>,unique:(id:string,input:unknown,work:()=>Promise<unknown>)=>Promise<unknown>,locked=false){
  const background = localMCPBackgroundAllowed(grant)
  const catalogOnly = locked && !background
  const automaticApproval = grant.application?.automaticStudio === true
  const access = {
    appLocked: locked, backgroundOperationsAllowed: background, automaticApproval,
    generationRequiresUnlock: locked && (!background || !automaticApproval),
    downloadAllowed: grant.permissions.readFiles && !catalogOnly,
  }
  return tool({description:'Use Venice Studio from this app-wide endpoint. Use catalog, then describe with exact kind and model for supported parameters and concrete MCP calls. Use validate before generate; quote where supported. Generation returns id and kind. Check with {action:"wait",id,kind,timeout_seconds:30}. Once ready, list this job’s files with app_resources {action:"list",generationId:id}, then read using items[].id as resourceId. Upload references with app_upload and use workspace paths. Paid calls require a stable request_id and owner approval unless automatically approved. Without granted background operations, Chatbox must be unlocked for actions beyond catalog and describe. Studio media APIs are separate from text E2EE.',inputSchema:z.object({sessionId:z.string().optional(),action:z.enum(['catalog','describe','validate','quote','generate','status','wait','pause','resume','cleanup_remote','voices','clone_voice','remove_voice']),kind:z.enum(studioKinds).optional(),model:z.string().max(256).optional(),prompt:z.string().max(100000).default(''),options:z.record(z.string(),z.unknown()).default({}),count:z.number().int().min(1).max(4).default(1),aspectRatio:z.string().max(40).default('auto'),referencePaths:z.array(z.string().max(512)).max(16).default([]),references:references.optional(),filePath:z.string().max(512).optional(),id:z.string().max(256).optional().describe('Local Studio job ID returned by generate; used with kind for status or wait.'),timeout_seconds:z.number().int().min(0).max(45).default(30),request_id:z.string().min(1).max(128).optional()}).strict(),execute:async input=>{
    if(grant.application?.providers&&!grant.application.providers.includes('venice'))throw Error('Venice is not granted to this endpoint')
    if (catalogOnly && input.action !== 'catalog' && input.action !== 'describe') throw Error('Unlock Chatbox to use this MCP operation')
    const { config, images, media, list, describe } = studioCatalog(grant, signal, catalogOnly)
    if (input.action === 'catalog') return { ...await list(input.kind, input.model), access }
    if (input.action === 'describe') {
      if (!input.kind || !input.model) throw Error('Provide kind and the exact model ID from the catalog')
      return { ...await describe(input.kind, input.model), access }
    }
    const id=await context(input.sessionId);await assert(id)
    const approve=async()=>{
      const review=JSON.stringify({action:input.action,kind:input.kind,model:input.model,prompt:input.prompt,options:input.options,referencePaths:input.referencePaths,references:input.references,filePath:input.filePath,count:input.count,aspectRatio:input.aspectRatio})
      if(review.length>64000)throw Error('Use app_upload for large binary references instead of embedding them in options')
      if(!grant.application!.automaticStudio&&!await requestExternalModelApproval(grant,{provider:'venice',modelId:input.model||'Venice Studio',messages:[{role:'user',content:'External Studio operation. Images/audio/video are not E2EE. Voice clones may remain until remote expiry.\n'+review}],maxOutputTokens:0},signal))throw Error('Studio request was not approved')
      await assert(id);const current=veniceConfiguration();if(current.apiKey!==config.apiKey||current.apiHost!==config.apiHost||JSON.stringify(current.options)!==JSON.stringify(config.options))throw Error('Venice configuration changed; review a new request')
    }
    const record=async()=>{const row=(await veniceMediaService.list()).find(row=>row.id===input.id&&row.sessionId===id);if(!row)throw Error('Generation is not in this workspace');return row}
    const download = (generationId: string) => ({ tool: 'app_resources', arguments: {
      action: 'list', generationId, ...(grant.application?.mode !== 'router' ? { sessionId: id } : {}),
    } })
    const summary=(row:Awaited<ReturnType<typeof record>>)=>({id:row.id,kind:row.kind,model:row.model,status:row.status,text:row.text,error:row.error,localAvailable:!!row.blobKey,remoteCleaned:row.remoteCleaned,
      ...(grant.permissions.readFiles && row.blobKey ? { download: download(row.id) } : {})})
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
        if(!(await media()).some(model=>model.id===input.model))throw Error('Voice-cloning model is not available to this endpoint')
        await approve();const voice=await veniceMediaService.createVoice(input.model,await file(grant,id,input.filePath,signal),input.prompt,signal)
        await mutateTemporaryMCPEntries(items=>items.map(item=>item.id===id?{...item,voices:[...(item.voices||[]),voice.id]}:item));return {id:voice.id,model:voice.model,name:voice.name,expiresAt:voice.expiresAt,remote:'Expires according to Venice retention; local cleanup does not remove the remote voice immediately'}
      }
      if(input.action==='generate'||input.action==='quote'||input.action==='validate'){
        if(!input.kind||!input.model)throw Error('Select kind and exact model ID from catalog')
        const options={...input.options};assertMediaToolOptions(input.kind,options)
        if (input.action !== 'quote' && !['transcription','voice-conversion'].includes(input.kind) && !input.prompt.trim()) throw Error('Provide a prompt.')
        if (input.kind !== 'image' && input.action === 'generate' && !mediaEnabled(input.kind, config.options)) throw Error('This Venice media module is disabled')
        if (input.kind !== 'image' && input.referencePaths.length) throw Error('Use references or filePath for this media kind.')
        if (input.kind === 'image' && (input.filePath || input.references)) throw Error('Use referencePaths for image inputs.')
        if(input.kind==='image'){
          if(input.action==='quote')throw Error('Image pricing is in the catalog; no quote endpoint is used')
          assertImageToolOptions(options)
          const selected = (await images()).find(model => model.modelId === input.model)
          if (!selected) throw Error('Image model is not available')
          if (input.action === 'validate') {
            buildVeniceImageRequest({ ...selected, extraBody: options }, config.options, {
              prompt: input.prompt, aspectRatio: input.aspectRatio, images: input.referencePaths.map(() => ({ imageUrl: 'reference' })),
            })
            for (const path of input.referencePaths) {
              const source = await file(grant,id, path, signal)
              if (!source.type.startsWith('image/')) throw Error('Image reference paths must point to uploaded images.')
            }
            return { valid: true, kind: input.kind, model: input.model, operation: 'generate' }
          }
          const refs=await Promise.all(input.referencePaths.map(async path=>dataURL(await file(grant,id,path,signal))))
          await approve()
          const handle=await getImageGenerationService().start({prompt:input.prompt,model:{provider:'venice',modelId:input.model,extraBody:options},imageGenerateNum:input.count,aspectRatio:input.aspectRatio,referenceImages:refs,protection:await vaultRuntimeFor(platform).projects.sessionScope(id)||undefined,source:{type:'chatbox_cli',sessionId:id,toolCallId:'studio:'+input.request_id}},{onRecordCreated:record=>registerTemporaryMCPImage(record,refs)})
          void handle.completion.catch(()=>{})
          return {id:handle.recordId,kind:'image',status:'pending',background:true}
        }
        const kind = input.kind
        const selected = (await media()).find(model => model.id === input.model && supportsMediaKind(model, kind))
        if (!selected) throw Error('Media model is not available for this category')
        const queuedAudio = kind === 'music' || kind === 'sound-effects' || kind === 'speech' && selected.type === 'music'
        if (queuedAudio && input.action === 'quote') validateAudioQuote(selected, options)
        const audioRefs = queuedAudio ? audioQueueCapabilities(selected).references : undefined
        if (queuedAudio && 'reference_audio_urls' in options) throw Error('Upload audio files with app_upload, and use references.reference_audio_urls for their workspace paths.')
        if (input.action === 'quote' && queuedAudio && input.references) throw Error('Audio quotes take pricing options only. Attach references when validating or generating.')
        let size = 0
        for (const [key, paths] of Object.entries(input.references || {})) {
          if (!paths) continue
          if (key in options) throw Error('Specify each reference once')
          if (kind !== 'video' && (!audioRefs || key !== 'reference_audio_urls')) throw Error('This model does not accept that reference input. Inspect its Studio model details.')
          if (audioRefs && Array.isArray(paths) && (!paths.length || paths.length > audioRefs.max)) throw Error('The selected model accepts up to ' + audioRefs.max + ' reference audio clips.')
          const values: string[] = []
          for (const path of Array.isArray(paths) ? paths : [paths]) {
            const source = await file(grant,id, path, signal)
            size += source.size
            if (size > (audioRefs?.combinedMaxBytes ?? 24 * 1024 * 1024)) throw Error('Combined reference files exceed the request limit.')
            if (audioRefs) {
              if (!source.type.startsWith('audio/') || source.size > audioRefs.maxBytes) throw Error('Each audio reference must be an audio file up to 10 MB.')
              validateVoiceDuration(await voiceFileDuration(source, signal), 0, audioRefs.maxSeconds)
            }
            values.push(await dataURL(source))
          }
          options[key] = Array.isArray(paths) ? values : values[0]
        }
        const needsSource = kind === 'transcription' || kind === 'voice-conversion'
        if (input.filePath && !needsSource) throw Error('This category does not accept filePath; consult the model details for the correct reference field.')
        if (needsSource && !input.filePath) throw Error('Upload the source recording with app_upload and provide filePath.')
        const source = input.filePath ? await file(grant,id,input.filePath,signal) : undefined
        const durationSeconds = kind === 'voice-conversion' && source ? await voiceFileDuration(source,signal) : undefined
        if (input.action !== 'quote') {
          const promptKey = kind === 'speech' && !queuedAudio ? 'input' : 'prompt'
          validateMediaRequest(kind, { model: input.model, [promptKey]: input.prompt, ...options }, selected)
          if (input.action === 'validate') return { valid: true, kind, model: input.model, operation: 'generate', moduleEnabled: mediaEnabled(kind, config.options) }
        }
        const request={kind:input.kind,model:input.model,prompt:input.prompt,options,file:source,durationSeconds,sessionId:id,signal,protection:await vaultRuntimeFor(platform).projects.sessionScope(id)||undefined}
        if(input.action==='quote')return veniceMediaService.quote(request)
        await approve();return summary(await veniceMediaService.start(request))
      }
      if(input.kind==='image'){
        if(!['status','wait'].includes(input.action))throw Error('Use image status to inspect this existing generation')
        const images = getImageGenerationService()
        const deadline = Date.now() + (input.action === 'wait' ? input.timeout_seconds * 1000 : 0)
        for (;;) {
          signal.throwIfAborted()
          await assert(id)
          const row = await images.getRecord(input.id || '')
          if (!row || row.source?.sessionId !== id) throw Error('Image is not in this workspace')
          const running = imageIsRunning(row.status)
          const remaining = deadline - Date.now()
          if (!running || remaining <= 0) {
            signal.throwIfAborted()
            await assert(id)
            return {
              id: row.id, kind: 'image', model: row.model.modelId, status: row.status,
              error: row.error, errorCode: row.errorCode, errorItemUuid: row.errorItemUuid,
              count: row.generatedImages.length,
              ...(grant.permissions.readFiles && row.generatedImages.length ? { download: download(row.id) } : {}),
              ...(input.action === 'wait' ? { timedOut: running } : {}),
            }
          }
          await waitForImagePoll(Math.min(500, remaining), signal)
        }
      }
      const row=await record()
      if (input.action === 'wait') {
        const { timedOut } = await veniceMediaService.waitFor(row.id,input.timeout_seconds*1000,signal)
        await assert(id)
        const current = await record()
        return { ...summary(current), timedOut: timedOut && !['ready', 'error', 'paused'].includes(current.status) }
      }
      if(input.action==='pause')await veniceMediaService.pause(row.id)
      else if(input.action==='resume'){await approve();await veniceMediaService.resume(row.id)}
      else if(input.action==='cleanup_remote'){await approve();await veniceMediaService.cleanup(row.id)}
      await assert(id);return summary(await record())
    }
    return input.request_id&&!localMCPObservation('venice_studio',input)?unique('studio:'+input.request_id,{...input,sessionId:id},work):work()
  }})
}
