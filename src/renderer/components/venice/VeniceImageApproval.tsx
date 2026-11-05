import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Button, FileInput, Group, NumberInput, Select, Stack, Text, Textarea } from '@mantine/core'
import { useEffect, useState } from 'react'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import type { ImageModelOption } from '@/packages/image-model-catalog'
import type { ImageChoice } from '@shared/providers/definitions/models/venice/image-tools'
import { VeniceModelBadges } from './VeniceModelBadges'
import { VeniceModelInfo } from './VeniceModelInfo'
export const VeniceImageApproval = NiceModal.create(({ models, request, signal }: { models: ImageModelOption[]; request: { modelId?: string; prompt: string; count: number }; signal?: AbortSignal }) => {
  const modal = useModal(); const [modelId, setModelId] = useState(request.modelId && models.some(m => m.modelId === request.modelId) ? request.modelId : models[0]?.modelId || '')
  const [prompt, setPrompt] = useState(request.prompt); const [count, setCount] = useState(request.count); const [ratio, setRatio] = useState('auto'); const [files, setFiles] = useState<File[]>([]); const [error, setError] = useState('')
  const model = models.find(m => m.modelId === modelId); const limits = model?.capabilities?.inputReferences
  const cancel = () => { modal.resolve(null); modal.hide() }
  useEffect(() => { const abort = () => cancel(); if (signal?.aborted) abort(); signal?.addEventListener('abort', abort, { once: true }); return () => signal?.removeEventListener('abort', abort) }, [signal])
  const confirm = async () => {
    try {
      signal?.throwIfAborted()
      if (!model || !prompt.trim() || files.length < (limits?.min || 0) || files.length > (limits?.max || 0)) throw new Error('Scegli un modello e carica i riferimenti richiesti nella sua scheda.')
      const referenceImages = await Promise.all(files.map(file => { if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Riferimenti: PNG, JPEG o WebP fino a 10 MB'); return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Impossibile leggere il riferimento')); reader.readAsDataURL(file) }) }))
      signal?.throwIfAborted(); modal.resolve({ modelId, prompt, count, aspectRatio: ratio, referenceImages } satisfies ImageChoice); modal.hide()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return <AdaptiveModal opened={modal.visible} onClose={cancel} title="Scegli e conferma le immagini" size="lg"><Stack>
    <Select label="Modello immagine Venice" searchable allowDeselect={false} comboboxProps={{ withinPortal: false }} value={modelId} data={models.map(model => ({ value: model.modelId, label: model.displayName }))} onChange={value => { setModelId(value || ''); setFiles([]); setRatio('auto') }} />
    <VeniceModelBadges metadata={model?.vendorMetadata} /><VeniceModelInfo model={model ? { id: model.modelId, type: String(model.vendorMetadata?.veniceType || 'image'), model_spec: model.vendorMetadata } : undefined} />
    <Textarea label="Descrizione da inviare" autosize minRows={3} value={prompt} onChange={e => setPrompt(e.currentTarget.value)} />
    <Group grow><NumberInput label="Numero di immagini" min={1} max={4} value={count} onChange={value => setCount(Math.min(4, Math.max(1, Number(value) || 1)))} /><Select label="Inquadratura" allowDeselect={false} value={ratio} data={['auto', ...(model?.capabilities?.aspectRatio?.values || []).filter(value => value !== 'auto')]} onChange={value => setRatio(value || 'auto')} /></Group>
    {limits && <FileInput multiple clearable label="Immagini da modificare o usare come riferimento" description={`Da ${limits.min || 0} a ${limits.max || 1} immagini`} accept="image/png,image/jpeg,image/webp" value={files} onChange={setFiles} />}
    <Text size="sm">Il contenuto viene inviato a Venice. Confermando autorizzi {count} generazioni a pagamento con il modello scelto.</Text>
    {error && <Alert color="red">{error}</Alert>}<Group justify="end"><Button variant="default" onClick={cancel}>Annulla</Button><Button disabled={!model || !prompt.trim()} onClick={() => void confirm()}>Conferma e genera</Button></Group>
  </Stack></AdaptiveModal>
})
