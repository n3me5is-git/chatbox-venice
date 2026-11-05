import { LibraryFileInput as FileInput } from '@/components/local-library/LibraryFileInput'
import { Accordion, Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useRef,useState } from 'react'
import { VeniceRecorder } from './VeniceRecorder'
import { voiceFileDuration,validateVoiceDuration } from '@/packages/voice-file'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import type { MediaCatalogItem, VeniceMediaService, VoiceHandle } from '@shared/providers/definitions/models/venice/media'
export type VoiceService = Partial<Pick<VeniceMediaService,'createVoice'|'listVoices'|'removeVoice'>>
export function VeniceVoiceCloning({ service, model, enabled, onChoose }: { service:VoiceService; model:MediaCatalogItem; enabled:boolean; onChoose:(id:string)=>void }) {
  useTranslation()
  const [file,setFile]=useState<File|null>(null);const [name,setName]=useState('');const [voices,setVoices]=useState<VoiceHandle[]>([])
  const [error,setError]=useState('');const [busy,setBusy]=useState(false)
  const operation=useRef<AbortController|null>(null)
  const spec=model.model_spec?.voice_cloning as {accepted_formats?:string[];min_sample_seconds?:number;max_sample_seconds?:number;retention_days?:number}
  useEffect(()=>{const stop=()=>operation.current?.abort();window.addEventListener('chatbox:privacy-lock',stop);return()=>{stop();window.removeEventListener('chatbox:privacy-lock',stop)}},[model.id])
  useEffect(()=>{let live=true;void service.listVoices?.(model.id).then(rows=>{if(live)setVoices(rows)}).catch(()=>{});return()=>{live=false}},[model.id,service])
  const perform=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  return <Accordion><Accordion.Item value="voice-clone"><Accordion.Control>{ft('Use my own voice')}</Accordion.Control><Accordion.Panel><Stack gap="sm">
    <Text size="sm">{ft('Upload a clean recording of one speaker. The sample is sent to Venice only when you create the voice.')}</Text>
    <Text size="xs" c="dimmed">{ft('Minimum sample: {{seconds}} seconds. Venice retains the sample for up to {{days}} days; the saved voice expires automatically.',{seconds:spec.min_sample_seconds||5,days:spec.retention_days||7})}</Text>
    <TextInput label={ft('Voice name')} value={name} onChange={e=>setName(e.currentTarget.value)} maxLength={100}/>
    <VeniceRecorder onRecorded={setFile} compatibleFormats={spec.accepted_formats||['wav']}/>
    <FileInput label={ft('Reference voice sample')} accept={(spec.accepted_formats||[]).map(format=>'.'+format).join(',')} value={file} onChange={setFile} clearable/>
    <Button disabled={!enabled||!file||!service.createVoice} loading={busy} onClick={()=>void perform(async()=>{const controller=new AbortController();operation.current=controller;validateVoiceDuration(await voiceFileDuration(file!,controller.signal),spec.min_sample_seconds||5,spec.max_sample_seconds||300);controller.signal.throwIfAborted();const voice=await service.createVoice!(model.id,file!,name,controller.signal);setVoices(rows=>[...rows,voice]);setFile(null);onChoose(voice.id)})}>{ft('Create voice from sample')}</Button>
    {voices.map(voice=><Group key={voice.id} justify="space-between"><Button variant="light" size="xs" onClick={()=>onChoose(voice.id)}>{voice.name}</Button><Button variant="subtle" size="xs" onClick={()=>void perform(async()=>{await service.removeVoice?.(voice.id);setVoices(rows=>rows.filter(row=>row.id!==voice.id))})}>{ft('Remove saved voice')}</Button></Group>)}
    <Text size="xs" c="dimmed">{ft('Removing a saved voice deletes its local reference. Venice currently documents automatic expiry of samples, not an immediate deletion API.')}</Text>
    {error&&<Alert color="red">{error}</Alert>}
  </Stack></Accordion.Panel></Accordion.Item></Accordion>
}
