import { Accordion, Button, Checkbox, NumberInput, Stack, Text } from '@mantine/core'
import { ModelSelectorV2 } from '@/components/ModelSelectorV2'
import { forkT as ft } from '@/i18n/fork'
import type { RagSettings } from '@shared/session-rag'
import { RagMediaOptions } from './RagMediaOptions'

export const collectionConsentLabel = 'I allow the selected embedding/OCR/STT providers to process the enabled content. Their privacy level may differ from this chat model.'

export function CollectionSettings({ value, onChange, ack, onAck, consent = true }: {
  value: RagSettings; onChange: (value: RagSettings) => void; ack: boolean; onAck: (value: boolean) => void; consent?: boolean
}) {
  const update = (patch: Partial<RagSettings>) => { onChange({ ...value, ...patch }); onAck(false) }
  return <Stack gap="sm">
    <Text fw={500}>{ft('Embedding model')}</Text>
    <ModelSelectorV2 withinPortal={false} selectedProviderId={value.provider} selectedModelId={value.model} modelFilter={model => model.type === 'embedding'} onSelect={(provider, model) => update({ provider, model, images: false, audio: false })}>
      <Button variant="default" fullWidth className="feature-model-button">{value.model || ft('Choose an embedding model')}</Button>
    </ModelSelectorV2>
    <Text size="xs" c="dimmed">{ft('Choose providers whose privacy matches your documents. Local encryption does not encrypt remote model processing.')}</Text>
    <Accordion variant="separated" multiple>
      <Accordion.Item value="processing"><Accordion.Control>{ft('Document processing')}</Accordion.Control><Accordion.Panel><Stack gap="sm"><NumberInput label={ft('Maximum parallel model requests')} description={ft('Shared by OCR, embeddings and knowledge extraction. Use 1 for sequential processing or a low limit for providers with rate limits. Large files remain memory-bounded.')} min={1} max={8} allowDecimal={false} value={value.indexConcurrency??1} onChange={n=>{if(typeof n==='number'&&Number.isInteger(n)&&n>=1&&n<=8)update({indexConcurrency:n})}}/><Checkbox label={ft('Keep images with extracted Markdown')} description={ft('Save local page previews and image assets with the source. This uses disk space and does not add model requests.')} checked={value.retainImages===true} onChange={event=>update({retainImages:event.currentTarget.checked})}/><RagMediaOptions value={value} update={update}/></Stack></Accordion.Panel></Accordion.Item>
      <Accordion.Item value="embedding"><Accordion.Control>{ft('Advanced embedding options')}</Accordion.Control><Accordion.Panel><NumberInput label={ft('Embedding dimensions (optional)')} min={128} max={8192} value={value.dimensions ?? ''} onChange={n => update({ dimensions: typeof n === 'number' ? n : undefined })}/></Accordion.Panel></Accordion.Item>
    </Accordion>
    {consent && <Checkbox label={ft(collectionConsentLabel)} checked={ack} onChange={event => onAck(event.currentTarget.checked)}/>}
  </Stack>
}
