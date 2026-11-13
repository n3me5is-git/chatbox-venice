import {RagMediaOptions} from './RagMediaOptions'
import {Button,Checkbox,NumberInput,Stack,Switch,Text} from '@mantine/core'
import {ModelSelectorV2} from '@/components/ModelSelectorV2'
import {forkT as ft} from '@/i18n/fork'
import type {RagSettings} from '@shared/session-rag'
export function CollectionSettings({value,onChange,ack,onAck}:{value:RagSettings;onChange:(value:RagSettings)=>void;ack:boolean;onAck:(value:boolean)=>void}){
 const update=(patch:Partial<RagSettings>)=>{onChange({...value,...patch});onAck(false)}
 return <Stack gap="sm"><Text fw={500}>{ft('Embedding model')}</Text><ModelSelectorV2 withinPortal={false} selectedProviderId={value.provider} selectedModelId={value.model} modelFilter={model=>model.type==='embedding'} onSelect={(provider,model)=>update({provider,model,images:false,audio:false})}><Button variant="default" fullWidth style={{height:'auto',minHeight:40,whiteSpace:'normal'}}>{value.model||ft('Choose an embedding model')}</Button></ModelSelectorV2>
 <Text size="xs" c="dimmed">{ft('Private Venice embedding models are preferred when configured. Local encryption does not make remote embeddings or OCR end-to-end encrypted.')}</Text>
 <NumberInput label={ft('Embedding dimensions (optional)')} min={128} max={8192} value={value.dimensions??''} onChange={n=>update({dimensions:typeof n==='number'?n:undefined})}/>
 <RagMediaOptions value={value} update={update}/>
 <Checkbox label={ft('I allow the selected embedding/OCR/STT providers to process the enabled content. Their privacy level may differ from this chat model.')} checked={ack} onChange={e=>onAck(e.currentTarget.checked)}/></Stack>
}
