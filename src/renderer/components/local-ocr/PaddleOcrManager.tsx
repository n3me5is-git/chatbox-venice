import {Alert,Anchor,Button,Group,Modal,NumberInput,Progress,Select,Stack,Text,Textarea} from '@mantine/core'
import {useEffect,useRef,useState} from 'react'
import {useTranslation} from 'react-i18next'
import {PADDLE_OCR_MODEL,type PaddleOcrStatus} from '@shared/paddle-ocr'
import type {LocalOcrConfig} from '@shared/local-ocr'
import {paddleOcrControl,paddleOcrStatus,recognizePaddle} from '@/packages/paddle-ocr/client'
import {localOcrDesktop} from '@/packages/local-ocr/client'
import {forkT as ft} from '@/i18n/fork'
import platform from '@/platform'
export function PaddleOcrManager({onClose,onUse}:{onClose:()=>void;onUse:(model:string)=>void}){
 useTranslation();const [status,setStatus]=useState<PaddleOcrStatus>(),[draft,setDraft]=useState<LocalOcrConfig>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[test,setTest]=useState(''),[testing,setTesting]=useState(false),image=useRef<HTMLInputElement>(null),active=useRef(true),controller=useRef<AbortController|undefined>(undefined)
 useEffect(()=>{active.current=true;const refresh=()=>{void paddleOcrStatus().then(value=>{if(active.current){setStatus(value);setDraft(current=>current||value.config)}},error=>{if(active.current)setError(error.message)})};refresh();const timer=setInterval(refresh,1000);return()=>{active.current=false;clearInterval(timer);controller.current?.abort()}},[])
 const run=async(command:string,value?:unknown)=>{setBusy(true);setError('');try{const result=await paddleOcrControl(command,value);if(active.current)setStatus(result?.config?result:await paddleOcrStatus())}catch(error){if(active.current)setError((error as Error).message)}finally{if(active.current)setBusy(false)}}
 const running=busy||status?.busy||!!status?.pending,configure=(patch:Partial<LocalOcrConfig>)=>setDraft(current=>({...status!.config,...current,...patch}))
 const tryImage=async(file:File)=>{const job=new AbortController();controller.current=job;setTesting(true);setTest('');setError('');try{if(file.size>16*1024*1024)throw Error('Use a supported local OCR image');const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Unable to read the image'));reader.readAsDataURL(file)});const text=await recognizePaddle(PADDLE_OCR_MODEL,data,job.signal);if(active.current)setTest(text)}catch(error){if(active.current)setError((error as Error).message)}finally{if(active.current)setTesting(false)}}
 return <Modal opened onClose={onClose} title={ft('Local PaddleOCR')} size="lg" styles={{body:{maxHeight:'75dvh',overflowY:'auto',touchAction:'pan-y'}}}><Stack gap="md">
 <Text size="sm">{ft('Fast local text recognition for Latin languages, including Italian and English. Images and PDF pages stay on this device. Installation downloads public components from GitHub.')}</Text>
 <Text size="sm" c="dimmed">{ft('Detects text regions and preserves geometric reading order. This option does not include PP-Structure table reconstruction, formula recognition or AI image descriptions.')}</Text>
 {(error||status?.error)&&<Alert color="red">{ft(error||status!.error!)}</Alert>}
 {!status?<Text>{ft('Loading…')}</Text>:<>
 {!status.platformSupported&&<Alert color="orange">{ft('Local PaddleOCR is unavailable on this device')}</Alert>}
 <Group grow align="end"><Select comboboxProps={{withinPortal:false}} label={ft('Processing hardware')} value={draft?.backend||status.config.backend} data={[{value:'cpu',label:ft('CPU')},{value:'vulkan',label:ft('GPU (Vulkan)')}]} allowDeselect={false} disabled={running} onChange={value=>value&&configure({backend:value as 'cpu'|'vulkan'})}/><NumberInput label={ft('CPU threads')} min={1} max={32} value={draft?.threads??status.config.threads} disabled={running} onChange={value=>typeof value==='number'&&configure({threads:value})}/></Group>
 {(draft?.backend||status.config.backend)==='vulkan'&&<Text size="xs" c="dimmed">{ft('Requires compatible Vulkan drivers. The first load may take longer while GPU shaders are prepared.')}</Text>}
 <NumberInput label={ft('Keep the model ready after the queue finishes (seconds)')} description={ft('New pages or requests reset the timer. Zero releases the model as soon as the queue is empty.')} min={0} max={1800} step={30} value={draft?.idleSeconds??status.config.idleSeconds} disabled={running} onChange={value=>typeof value==='number'&&configure({idleSeconds:value})}/>
 <Button variant="default" disabled={running||!draft||JSON.stringify(draft)===JSON.stringify(status.config)} onClick={()=>void run('configure',draft)}>{ft('Apply processing settings')}</Button>
 <Text size="sm">{status.loaded?ft('Model loaded'):status.starting?ft('Loading OCR model…'):ft('Model unloaded')} · {ft('Queued pages')}: {status.pending}{status.device?' · '+status.device:''}</Text>
 <Group wrap="wrap"><Button disabled={!status.platformSupported||running||status.ready} onClick={()=>void run('download')}>{status.ready?ft('Runtime installed'):ft('Download engine and language model')}</Button>{localOcrDesktop()&&<Button variant="default" disabled={running} onClick={()=>void run('import')}>{ft('Import verified PaddleOCR package')}</Button>}<Button variant="subtle" disabled={!status.loaded} onClick={()=>void run('unload')}>{ft('Release memory now')}</Button>{status.ready&&<Button variant="subtle" color="red" disabled={running} onClick={()=>void run('remove')}>{ft('Remove downloaded file')}</Button>}</Group>
 {status.progress&&<Stack gap={3}><Text size="xs">{(status.progress.bytes/1e6).toFixed(1)} / {(status.progress.total/1e6).toFixed(1)} MB</Text><Progress value={100*status.progress.bytes/status.progress.total}/><Button variant="subtle" size="xs" onClick={()=>void paddleOcrControl('cancel-download')}>{ft('Cancel download')}</Button></Stack>}
 <Button disabled={!status.ready||running} onClick={()=>onUse(PADDLE_OCR_MODEL)}>{ft('Use this OCR model')}</Button>
 <input ref={image} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void tryImage(file)}}/>
 <Group><Button variant="default" loading={testing} disabled={!status.ready||running} onClick={()=>image.current?.click()}>{ft('Test OCR with an image')}</Button>{testing&&<Button variant="subtle" onClick={()=>controller.current?.abort()}>{ft('Cancel')}</Button>}</Group>
 {test&&<Textarea label={ft('Recognized text')} value={test} readOnly autosize minRows={3} maxRows={12}/>}
 <Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{ft('Model storage')}: {status.root}</Text>
 {status.diagnostic&&<details><summary>{ft('Technical details')}</summary><Textarea value={status.diagnostic} readOnly autosize minRows={2} maxRows={6}/></details>}
 </>}
 <Anchor size="xs" onClick={()=>void platform.openLink('https://github.com/PaddlePaddle/PaddleOCR')}>PaddleOCR · Apache-2.0</Anchor>
 </Stack></Modal>
}
