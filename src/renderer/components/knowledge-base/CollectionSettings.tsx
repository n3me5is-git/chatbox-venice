import {settingsStore} from '@/stores/settingsStore'
import {Button,Checkbox,NumberInput,Stack,Switch,Text} from '@mantine/core'
import {ModelSelectorV2} from '@/components/ModelSelectorV2'
import {forkT as ft} from '@/i18n/fork'
import type {RagSettings} from '@shared/session-rag'
import {multimodalEmbedding} from '@/packages/session-rag/embeddings'
export function CollectionSettings({value,onChange,ack,onAck}:{value:RagSettings;onChange:(value:RagSettings)=>void;ack:boolean;onAck:(value:boolean)=>void}){
 const update=(patch:Partial<RagSettings>)=>{onChange({...value,...patch});onAck(false)},multi=multimodalEmbedding(value.provider,value.model)
 return <Stack gap="sm"><Text fw={500}>{ft('Embedding model')}</Text><ModelSelectorV2 withinPortal={false} selectedProviderId={value.provider} selectedModelId={value.model} modelFilter={model=>model.type==='embedding'} onSelect={(provider,model)=>update({provider,model,images:false,audio:false})}><Button variant="default" fullWidth style={{height:'auto',minHeight:40,whiteSpace:'normal'}}>{value.model||ft('Choose an embedding model')}</Button></ModelSelectorV2>
 <Text size="xs" c="dimmed">{ft('Private Venice embedding models are preferred when configured. Local encryption does not make remote embeddings or OCR end-to-end encrypted.')}</Text>
 <NumberInput label={ft('Embedding dimensions (optional)')} min={128} max={8192} value={value.dimensions??''} onChange={n=>update({dimensions:typeof n==='number'?n:undefined})}/>
 <Switch label={ft('Index photos directly (no OCR)')} disabled={!multi} checked={value.images} onChange={e=>update({images:e.currentTarget.checked})}/><Switch label={ft('Index audio directly (no transcription)')} disabled={!multi} checked={value.audio} onChange={e=>update({audio:e.currentTarget.checked})}/>
 {!multi&&<Text size="xs" c="dimmed">{ft('Native media requires an API that accepts multimodal input. Venice currently exposes text-only embeddings, including its Gemini model. Select direct Gemini Embedding 2 for native photos/audio.')}</Text>}
 <Switch label={ft('Optional OCR for images and scanned PDFs')} checked={value.ocr} onChange={e=>update({ocr:e.currentTarget.checked})}/>
 {value.ocr&&<ModelSelectorV2 withinPortal={false} selectedProviderId={value.ocrProvider} selectedModelId={value.ocrModel} modelFilter={model=>model.capabilities?.includes('vision')===true} onSelect={(ocrProvider,ocrModel)=>update({ocrProvider,ocrModel})}><Button variant="default">{value.ocrModel||ft('Choose an OCR model')}</Button></ModelSelectorV2>}
 <Switch label={ft('Transcribe audio for text indexing')} checked={value.stt} onChange={event=>{const selected=settingsStore.getState().getSettings().defaultASRModel;update({stt:event.currentTarget.checked,...(selected?{sttProvider:selected.provider,sttModel:selected.model}:{})})}}/>
 {value.stt&&<><Text size="sm">{ft('STT model')}: {value.sttModel||ft('Choose a global STT model before enabling transcription')}</Text><Button variant="subtle" size="xs" onClick={()=>{const selected=settingsStore.getState().getSettings().defaultASRModel;if(selected)update({sttProvider:selected.provider,sttModel:selected.model})}}>{ft('Use current global STT selection')}</Button></>}
 <Checkbox label={ft('I allow the selected embedding/OCR providers to process the enabled content. Their privacy level may differ from this chat model.')} checked={ack} onChange={e=>onAck(e.currentTarget.checked)}/></Stack>
}
