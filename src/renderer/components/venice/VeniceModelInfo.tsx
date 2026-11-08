import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { registerPlugin } from '@capacitor/core'
import { Accordion, Alert, Button, Code, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import type { MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
import { mediaCategory, seedanceReferenceModel } from '@shared/providers/definitions/models/venice/media-capabilities'
import platform from '@/platform'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { VeniceModelBadges } from './VeniceModelBadges'
import { categoryLabels } from './model-labels'
import { IconInfoCircle } from '@tabler/icons-react'
import { videoVariant, videoModelDocumentation } from '@shared/providers/definitions/models/venice/model-variant'
import { VenicePricing } from './VenicePricing'
const paths: Record<string, string> = { text:'chat/completions',image:'image/generate',inpaint:'image/multi-edit',tts:'audio/speech',asr:'audio/transcriptions',video:'video/queue',music:'audio/queue',embedding:'embeddings/create' }
const labels:Record<string,string>={per_thousand_characters:'Per 1,000 characters',default_duration:'Default duration (seconds)',default_voice:'Default voice',default_format:'Default format',default_speed:'Default speed',min_speed:'Minimum speed',max_speed:'Maximum speed',accepted_audio_formats:'Accepted audio formats',max_source_audio_duration_seconds:'Maximum source audio duration (seconds)',input:'Input / 1M tokens',output:'Output / 1M tokens',cache_input:'Cached input / 1M tokens',generation:'Per generation',per_second:'Per second',durations:'Duration',usd:'USD',diem:'DIEM',aspect_ratios:'Aspect ratios',aspectRatios:'Aspect ratios',resolutions:'Resolution',model_type:'Generation mode',maxInputImages:'Maximum reference images',image_input:'Start image',video_input:'Source video',supports_end_image:'End frame',supports_reference_images:'Reference images',audio_input:'Audio input',audio_configurable:'Generate video audio',supported_formats:'File formats',voices:'Available voices',min_duration:'Minimum duration (seconds)',max_duration:'Maximum duration (seconds)',duration_options:'Duration (seconds)',prompt_character_limit:'Maximum prompt characters',lyrics_character_limit:'Maximum lyrics characters',min_prompt_length:'Minimum prompt characters',supports_lyrics:'Lyrics',lyrics_required:'Lyrics required',supports_force_instrumental:'Instrumental only',supports_loop:'Seamless loop',supports_speed:'Reading speed',supports_language_code:'Language selection',supports_lyrics_optimizer:'Automatic lyrics',supports_custom_voice_id:'Custom voice',supports_seed:'Reproducible variation (seed)',min_seconds:'Minimum seconds',max_seconds:'Maximum seconds'}
const capabilityLabels:Record<string,string>={supportsFunctionCalling:'Tool calling',supportsE2EE:'End-to-end encryption',supportsTeeAttestation:'TEE attestation',supportsReasoning:'Reasoning',supportsVision:'Vision',supportsImageInput:'Start image',supportsVideoInput:'Source video',supportsReferenceImages:'Reference images',supportsEndImage:'End frame',supportsAudio:'Generate video audio',audio:'Generate video audio',per_reference_audio:'Reference audio'}
const human=(key:string)=>ft(capabilityLabels[key]||labels[key]||key.replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2'))
function Facts({value,locale}:{value:Record<string,unknown>;locale:string}){
 return <Stack gap={6}>{Object.entries(value).map(([key,item])=>{
   if(item===undefined||item===null)return null
   const name=human(key)
   if(typeof item==='object'&&!Array.isArray(item))return <Paper key={key} withBorder p="xs" radius="sm"><Text size="sm" fw={600} mb={5}>{name}</Text><Facts value={item as Record<string,unknown>} locale={locale}/></Paper>
   const text=typeof item==='boolean'?ft(item?'Supported':'Not supported'):['usd','diem'].includes(key)&&typeof item==='number'?new Intl.NumberFormat(locale,{maximumFractionDigits:6}).format(item)+' '+key.toUpperCase():Array.isArray(item)?item.map(String).join(' · '):String(item)
   return <Group key={key} justify="space-between" align="start" wrap="wrap"><Text size="sm" c="dimmed">{name}</Text><Text size="sm" fw={500} style={{overflowWrap:'anywhere',maxWidth:'100%'}}>{text}</Text></Group>
 })}</Stack>
}
export async function openVeniceDocumentation(url:string){
 if(platform.type==='mobile')return registerPlugin<{openDocumentation(input:{url:string;close:string;browser:string;unavailable:string}):Promise<void>}>('DocumentSaver').openDocumentation({url,close:ft('Close'),browser:ft('Open in Chrome'),unavailable:ft('Chrome is unavailable. Use Open in browser.')})
 if(platform.isDesktopLike)return window.electronAPI.invoke('openLink',url,{browser:'internal'})
 return platform.openLink(url)
}
export function VeniceModelInfo({model}:{model?:MediaCatalogItem}){
 useTranslation();const [opened,setOpened]=useState(false)
 if(!model)return null
 return <><Button size="xs" variant="subtle" leftSection={<IconInfoCircle size={16}/>} onClick={()=>setOpened(true)}>{ft('Model details and options')}</Button><VeniceModelDetails model={opened?model:undefined} onClose={()=>setOpened(false)}/></>
}
export function VeniceModelDetails({model,onClose}:{model?:MediaCatalogItem;onClose:()=>void}){
 const {i18n}=useTranslation();const [error,setError]=useState('')
 if(!model)return null
 const spec=model.model_spec||{},locale=i18n.resolvedLanguage||i18n.language||'en'
 const docs=`https://docs.venice.ai/api-reference/endpoint/${paths[model.type]||'models/list'}`
 const card=model.type==='video'?videoModelDocumentation(model):`https://venice.ai/models/${encodeURIComponent(model.id)}`
 const open=(url:string)=>{setError('');void openVeniceDocumentation(url).catch(()=>setError(ft('Unable to open documentation. Use Open in browser.')))}
 const options=Object.fromEntries(Object.entries(spec).filter(([key])=>/^(supports_|min_|max_|default_|duration|supported_formats|voices|lyrics_required|prompt_character_limit|lyrics_character_limit|accepted_audio)/.test(key)))
 return <AdaptiveModal opened={!!model} onClose={onClose} title={spec.name||model.id} size="lg"><Stack gap="md">
   <Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{model.id} · {ft(categoryLabels[mediaCategory(model)]||model.type)}</Text>
   {videoVariant(model)&&<Text size="sm" fw={600}>{ft(videoVariant(model)!)}</Text>}
   {seedanceReferenceModel(model)&&<Text size="sm">{ft('Also supports video editing through reference videos.')}</Text>}
   <VeniceModelBadges metadata={spec} showUnknown/>
   {/^elevenlabs-music(?:-v2(?:-5)?)?$/.test(model.id)&&<Paper withBorder p="sm" radius="sm"><Text size="sm" fw={600}>{ft('Audio references')}</Text><Text size="sm">{ft('The model website advertises audio references, but the current public Venice audio API does not document an input field. Support through this integration has not been verified.')}</Text></Paper>}
   <VenicePricing key={model.id} model={model} onQuote={async input=>{const {veniceMediaService}=await import('@/packages/venice/service');return veniceMediaService.quote(input)}}/>
   {spec.description&&<Text size="sm">{spec.description}</Text>}
   <Text size="xs" c="dimmed">{ft('Privacy, filters, pricing and parameters are declared by Venice. A missing option is not a verified capability.')}</Text>
   <Group><Button size="xs" onClick={()=>open(card)}>{ft('Venice model page')}</Button><Button size="xs" onClick={()=>open(docs)}>{ft('API documentation')}</Button><Button size="xs" variant="default" onClick={()=>open('https://venice.ai/models')}>{ft('Venice model library')}</Button><Button size="xs" variant="subtle" onClick={()=>void platform.openLink(docs)}>{ft('Open in browser')}</Button><Button size="xs" variant="subtle" onClick={()=>{setError('');void (platform.isDesktopLike?window.electronAPI.invoke('openLink',docs,{browser:'chrome'}):platform.type==='mobile'?registerPlugin<{openInChrome(input:{url:string}):Promise<void>}>('DocumentSaver').openInChrome({url:docs}):platform.openLink(docs)).catch(()=>setError(ft('Chrome is unavailable. Use Open in browser.')))}}>{ft('Open in Chrome')}</Button></Group>
   {error&&<Alert color="orange">{ft(error)}</Alert>}
   <Title order={5}>{ft('Options allowed by the catalog')}</Title><Facts value={{...spec.capabilities,...spec.constraints,...options}} locale={locale}/>
   <Accordion><Accordion.Item value="raw"><Accordion.Control>{ft('Technical catalog data')}</Accordion.Control><Accordion.Panel><Code block style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(spec,null,2)}</Code></Accordion.Panel></Accordion.Item></Accordion>
 </Stack></AdaptiveModal>
}
