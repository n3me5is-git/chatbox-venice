import {OcrVisionFallbackSettings} from '@/components/local-ocr/OcrVisionFallbackSettings'
import {isLocalOcrProvider} from '@shared/local-ocr'
import {OcrModelSelector} from '@/components/local-ocr/OcrModelSelector'
import {Button,Checkbox,Stack,Switch,Text} from '@mantine/core'
import type {RagSettings} from '@shared/session-rag'
import {embeddingMediaSupport} from '@/packages/session-rag/embeddings'
import {settingsStore} from '@/stores/settingsStore'
import {forkT as ft} from '@/i18n/fork'
export function RagMediaOptions({value,update,session=false}:{value:RagSettings;update:(patch:Partial<RagSettings>)=>void;session?:boolean}){
 const native=embeddingMediaSupport(value.provider,value.model),textOnly=value.provider==='venice'
 return <Stack gap="sm">{textOnly?<><Switch label={ft('Use text embeddings for media')} checked disabled/><Text size="xs" c="dimmed">{ft('Venice currently accepts text embeddings only. Images use OCR and audio uses transcription when enabled below. Without extraction, those media are not indexed; they are never sent as base64 text.')}</Text></>:<>
 <Checkbox label={ft(session?'Embed photos directly':'Index photos directly (no OCR)')} disabled={!native.image} checked={value.images&&native.image} onChange={event=>update({images:event.currentTarget.checked})}/><Checkbox label={ft(session?'Embed audio directly':'Index audio directly (no transcription)')} disabled={!native.audio} checked={value.audio&&native.audio} onChange={event=>update({audio:event.currentTarget.checked})}/>
 {!native.image&&!native.audio&&<Text size="xs" c="dimmed">{ft('Direct photo/audio embeddings require a supported multimodal embedding model, such as Gemini Embedding 2.')}</Text>}</>}
 <Switch label={ft('Optional OCR for images and scanned PDFs')} checked={value.ocr} onChange={event=>update({ocr:event.currentTarget.checked})}/>
 {value.ocr&&<Checkbox label={ft('Read all PDF pages with OCR')} description={ft('Useful for columns, tables or broken PDF text layers. Replaces embedded PDF text with the selected OCR result. Every page is processed, so indexing may take longer.')} checked={value.pdfOcrMode==='all'} onChange={event=>update({pdfOcrMode:event.currentTarget.checked?'all':'scanned'})}/>}
 <Switch label={ft('Describe images and PDF pages for search')} disabled={isLocalOcrProvider(value.ocrProvider)} description={ft('Adds a brief AI-generated description beside OCR text. Descriptions are inferred and labelled separately. This may send each enabled image/page to the selected vision model.')} checked={value.describeImages} onChange={event=>update({describeImages:event.currentTarget.checked})}/>
 {(value.ocr||value.describeImages)&&<OcrModelSelector value={{provider:value.ocrProvider,model:value.ocrModel}} onSelect={(ocrProvider,ocrModel)=>update({ocrProvider,ocrModel,...(isLocalOcrProvider(ocrProvider)?{describeImages:false}:{})})}/>}
 {(value.ocr||value.describeImages)&&!isLocalOcrProvider(value.ocrProvider)&&<Switch label={ft('Use concise OCR and image descriptions')} description={ft('Uses the lowest supported thinking mode for faster extraction. Turn off to keep the model’s default reasoning.')} checked={value.ocrReasoning==='concise'} onChange={event=>update({ocrReasoning:event.currentTarget.checked?'concise':'auto'})}/>}
 {value.ocr&&isLocalOcrProvider(value.ocrProvider)&&<OcrVisionFallbackSettings value={value.ocrVisionFallback} onChange={ocrVisionFallback=>update({ocrVisionFallback})}/>}
 <Switch label={ft('Index file metadata')} description={ft('Includes filenames, PDF properties and supported image metadata such as author, camera and capture date. File metadata can be edited and is not independently authenticated.')} checked={value.fileMetadata} onChange={event=>update({fileMetadata:event.currentTarget.checked,...(!event.currentTarget.checked?{locationMetadata:false}:{})})}/>
 {value.fileMetadata&&<Switch label={ft('Include photo GPS coordinates')} description={ft('Location is excluded by default. Enable only if you want it stored in the index and sent to the selected processing providers.')} checked={value.locationMetadata} onChange={event=>update({locationMetadata:event.currentTarget.checked})}/>}
 <Switch label={ft('Transcribe audio for text indexing')} checked={value.stt} onChange={event=>{const selected=settingsStore.getState().getSettings().defaultASRModel;update({stt:event.currentTarget.checked,...(selected?{sttProvider:selected.provider,sttModel:selected.model}:{})})}}/>
 {value.stt&&<><Text size="sm">{ft('STT model')}: {value.sttModel||ft('Choose a global STT model before enabling transcription')}</Text><Button variant="subtle" size="xs" onClick={()=>{const selected=settingsStore.getState().getSettings().defaultASRModel;if(selected)update({sttProvider:selected.provider,sttModel:selected.model})}}>{ft('Use current global STT selection')}</Button></>}
 </Stack>
}
