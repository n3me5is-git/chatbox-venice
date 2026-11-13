import {Button,Checkbox,Stack,Switch,Text} from '@mantine/core'
import type {RagSettings} from '@shared/session-rag'
import {embeddingMediaSupport} from '@/packages/session-rag/embeddings'
import {settingsStore} from '@/stores/settingsStore'
import {ModelSelectorV2} from '@/components/ModelSelectorV2'
import {forkT as ft} from '@/i18n/fork'
export function RagMediaOptions({value,update,session=false}:{value:RagSettings;update:(patch:Partial<RagSettings>)=>void;session?:boolean}){
 const native=embeddingMediaSupport(value.provider,value.model),textOnly=value.provider==='venice'
 return <Stack gap="sm">{textOnly?<><Switch label={ft('Use text embeddings for media')} checked disabled/><Text size="xs" c="dimmed">{ft('Venice currently accepts text embeddings only. Images use OCR and audio uses transcription when enabled below. Without extraction, those media are not indexed; they are never sent as base64 text.')}</Text></>:<>
 <Checkbox label={ft(session?'Embed photos directly':'Index photos directly (no OCR)')} disabled={!native.image} checked={value.images&&native.image} onChange={event=>update({images:event.currentTarget.checked})}/><Checkbox label={ft(session?'Embed audio directly':'Index audio directly (no transcription)')} disabled={!native.audio} checked={value.audio&&native.audio} onChange={event=>update({audio:event.currentTarget.checked})}/>
 {!native.image&&!native.audio&&<Text size="xs" c="dimmed">{ft('Direct photo/audio embeddings require a supported multimodal embedding model, such as Gemini Embedding 2.')}</Text>}</>}
 <Switch label={ft('Optional OCR for images and scanned PDFs')} checked={value.ocr} onChange={event=>update({ocr:event.currentTarget.checked})}/>
 {value.ocr&&<ModelSelectorV2 withinPortal={false} selectedProviderId={value.ocrProvider} selectedModelId={value.ocrModel} modelFilter={model=>model.capabilities?.includes('vision')===true} onSelect={(ocrProvider,ocrModel)=>update({ocrProvider,ocrModel})}><Button variant="default" fullWidth>{value.ocrModel||ft('Choose an OCR model')}</Button></ModelSelectorV2>}
 <Switch label={ft('Transcribe audio for text indexing')} checked={value.stt} onChange={event=>{const selected=settingsStore.getState().getSettings().defaultASRModel;update({stt:event.currentTarget.checked,...(selected?{sttProvider:selected.provider,sttModel:selected.model}:{})})}}/>
 {value.stt&&<><Text size="sm">{ft('STT model')}: {value.sttModel||ft('Choose a global STT model before enabling transcription')}</Text><Button variant="subtle" size="xs" onClick={()=>{const selected=settingsStore.getState().getSettings().defaultASRModel;if(selected)update({sttProvider:selected.provider,sttModel:selected.model})}}>{ft('Use current global STT selection')}</Button></>}
 </Stack>
}
