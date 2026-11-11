import {VeniceModelSelect} from './VeniceModelSelect'
import { LibraryFileInput as FileInput } from '@/components/local-library/LibraryFileInput'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { ApprovalModeOptions } from './VeniceSessionApprovals'
import { sessionApprovals, type ApprovalMode } from '@/packages/venice/session-approvals'
import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { Accordion, Alert, Button, Group, NumberInput, Select, Stack, Text, Textarea } from '@mantine/core'
import { parseExtraBody } from '@shared/models/utils/extra-body'
import { useEffect, useState } from 'react'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import type { ImageModelOption } from '@/packages/image-model-catalog'
import type { ImageChoice } from '@shared/providers/definitions/models/venice/image-tools'
import { VeniceModelBadges } from './VeniceModelBadges'
import {VeniceModelCost} from './VeniceModelCost'
import { VeniceModelInfo } from './VeniceModelInfo'
import { referenceImageModel, acceptsImageReferences } from '@shared/providers/definitions/models/venice/image-reference-model'
import { useReferenceModelSelection } from '@/hooks/useReferenceModelSelection'
import { ReferenceModelControl } from './ReferenceModelControl'
import { reusableLocalImageKey } from '@/packages/local-image-reference'
export const VeniceImageApproval = NiceModal.create(({ models, request, signal, sessionId }: { models: ImageModelOption[]; request: { modelId?: string; prompt: string; count: number; message?: string }; signal?: AbortSignal; sessionId?: string }) => {
  useTranslation()
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(() => sessionId ? sessionApprovals.mode(sessionId) : 'ask')
  const modal = useModal(); const [modelId, setModelId] = useState(request.modelId && models.some(m => m.modelId === request.modelId) ? request.modelId : '')
  usePrivacyDismiss(modal,null)
  const [safeMode, setSafeMode] = useState('default'); const [format, setFormat] = useState('default'); const [seed, setSeed] = useState<number | string>(''); const [extra, setExtra] = useState('')
  const [prompt, setPrompt] = useState(request.prompt); const [count, setCount] = useState(request.count); const [ratio, setRatio] = useState('auto'); const [files, setFiles] = useState<File[]>([]); const [error, setError] = useState('')
  const [automaticModel,setAutomaticModel]=useState(true)
  const model = models.find(m => m.modelId === modelId); const limits = model?.capabilities?.inputReferences
  const availableReferences=limits||referenceImageModel(models,modelId,1)?.capabilities?.inputReferences
  const chooseModel=(id:string)=>{setAutomaticModel(false);setModelId(id)}
  const selection=useReferenceModelSelection({models,selectedId:modelId,count:files.length,automatic:automaticModel,onSelect:setModelId})
  const chooseFiles=(next:File[])=>setFiles(next)
  useEffect(() => { setAutomaticModel(true);setModelId(request.modelId || ''); setPrompt(request.prompt); setCount(request.count); setRatio('auto'); setFiles([]); setError(''); setSafeMode('default'); setFormat('default'); setSeed(''); setExtra(''); setApprovalMode(sessionId ? sessionApprovals.mode(sessionId) : 'ask') }, [request, sessionId])
  const cancel = () => { modal.resolve(null); modal.hide() }
  useEffect(() => { const abort = () => cancel(); if (signal?.aborted) abort(); signal?.addEventListener('abort', abort, { once: true }); return () => signal?.removeEventListener('abort', abort) }, [signal])
  const confirm = async () => {
    try {
      signal?.throwIfAborted()
      if (!model || !prompt.trim() || files.length < (limits?.min || 0) || files.length > (limits?.max || 0)) throw new Error(ft("Choose a model and upload the references required in its details."))
      const referenceImages = await Promise.all(files.map(async file => { if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error(ft("References: PNG, JPEG or WebP, up to 10 MB")); const data=await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error(ft("Unable to read the reference"))); reader.readAsDataURL(file) });return await reusableLocalImageKey(file,data)||data }))
      const parsed = parseExtraBody(extra) || {}
      if (['model', 'modelId', 'prompt', 'input', 'images', 'style_references', 'variants', 'return_binary'].some(key => key in parsed)) throw new Error(ft("Use the controls for model, prompt, images and quantity. JSON is reserved for extra parameters."))
      const extraBody = { ...(safeMode !== 'default' ? { safe_mode: safeMode === 'on' } : {}), ...(format !== 'default' ? { [model.vendorMetadata?.veniceType === 'inpaint' ? 'output_format' : 'format']: format } : {}), ...(typeof seed === 'number' ? { seed } : {}), ...parsed }
      signal?.throwIfAborted(); modal.resolve({ modelId, prompt, count, aspectRatio: ratio, referenceImages, extraBody, approvalMode } satisfies ImageChoice & { approvalMode: ApprovalMode }); modal.hide()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return <AdaptiveModal opened={modal.visible} onClose={cancel} title={ft("Choose and confirm images")} size="lg"><Stack>
    {request.message && <Alert color="blue">{ft(request.message)}</Alert>}
    <VeniceModelSelect label={ft("Venice image model")} value={modelId || null} models={models.map(model=>({id:model.modelId,type:String(model.vendorMetadata?.veniceType||'image'),model_spec:{...model.vendorMetadata,name:model.displayName}}))} onChange={value => { chooseModel(value || ''); setRatio('auto'); setSafeMode('default'); setFormat('default'); setSeed(''); setExtra('') }} />
    <VeniceModelBadges metadata={model?.vendorMetadata} />{model&&<VeniceModelCost metadata={model.vendorMetadata} showLabel/>}<VeniceModelInfo model={model ? { id: model.modelId, type: String(model.vendorMetadata?.veniceType || 'image'), model_spec: model.vendorMetadata } : undefined} />
    <Textarea label={ft("Prompt to send")} autosize minRows={3} value={prompt} onChange={e => setPrompt(e.currentTarget.value)} />
    <Group grow><NumberInput label={ft("Number of images")} min={1} max={4} value={count} onChange={value => setCount(Math.min(4, Math.max(1, Number(value) || 1)))} /><Select label={ft("Aspect ratio")} comboboxProps={{ withinPortal: false }} allowDeselect={false} value={ratio} data={['auto', ...(model?.capabilities?.aspectRatio?.values || []).filter(value => value !== 'auto')]} onChange={value => setRatio(value || 'auto')} /></Group>
    {(availableReferences||files.length>0) && <FileInput cropImages multiple clearable label={ft("Images to edit or use as references")} description={ft("From {{min}} to {{max}} images", {min:limits?.min||0,max:availableReferences?.max||16})} accept="image/png,image/jpeg,image/webp" value={files} onChange={chooseFiles} />}
    <ReferenceModelControl model={model} count={files.length} automatic={automaticModel} onAutomaticChange={setAutomaticModel} compatible={selection.compatible} privacyChange={selection.privacyChange}>
      <VeniceModelSelect label={ft('Choose reference model')} value={modelId||null} models={models.filter(row=>acceptsImageReferences(row,files.length)).map(row=>({id:row.modelId,type:String(row.vendorMetadata?.veniceType||'image'),model_spec:{...row.vendorMetadata,name:row.displayName}}))} onChange={value=>value&&chooseModel(value)}/>
    </ReferenceModelControl>
    {files.length>0&&<Text size="xs" c="dimmed">{ft('The selected model and price apply to this reference-based generation.')}</Text>}
    <Group grow><Select label={ft("Content filter")} comboboxProps={{ withinPortal: false }} allowDeselect={false} value={safeMode} data={[{ value: 'default', label: ft("Model settings") }, { value: 'on', label: ft("On") }, { value: 'off', label: ft("Off") }]} onChange={value => setSafeMode(value || 'default')} /><Select label={ft("Image format")} comboboxProps={{ withinPortal: false }} allowDeselect={false} value={format} data={[{ value: 'default', label: ft("Default") }, { value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }]} onChange={value => setFormat(value || 'default')} /></Group>
    <Accordion><Accordion.Item value="call"><Accordion.Control>{ft("Parameters for this call")}</Accordion.Control><Accordion.Panel><Stack gap="sm"><Text size="xs" c="dimmed">{ft("Only this call is changed. Empty fields keep the model defaults.")}</Text>{model?.vendorMetadata?.veniceType !== 'inpaint' && <NumberInput label={ft("Seed for this generation")} value={seed} onChange={setSeed} />}<Textarea label={ft("Extra parameters for this call (JSON)")} value={extra} onChange={e => setExtra(e.currentTarget.value)} autosize minRows={2} /></Stack></Accordion.Panel></Accordion.Item></Accordion>
    <Text size="sm">{ft("You authorize {{count}} paid generations with the selected model. Content is sent to Venice.", {count})}</Text>
    {sessionId && <ApprovalModeOptions value={approvalMode} onChange={setApprovalMode} />}
    {error && <Alert color="red">{ft(error)}</Alert>}<Group justify="end"><Button variant="default" onClick={cancel}>{ft("Cancel")}</Button><Button disabled={!model || !prompt.trim() || !selection.compatible} onClick={() => void confirm()}>{ft("Confirm and generate")}</Button></Group>
  </Stack></AdaptiveModal>
})
