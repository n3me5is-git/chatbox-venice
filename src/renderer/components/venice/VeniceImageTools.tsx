import { Alert,Button,Checkbox,Group,Paper,SegmentedControl,Slider,Stack,Text,Title } from '@mantine/core'
import { useEffect,useRef,useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ImageGeneration } from '@shared/types'
import type { MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
import type { ImageOperation } from '@shared/providers/definitions/models/venice/image-processing'
import { formatPrice } from '@shared/providers/definitions/models/venice/pricing'
import { ImageInStorage } from '@/components/Image'
import { ProtectedPreviewGate } from '@/components/security/ProtectedPreviewGate'
import { requestProtectedAccess } from '@/components/security/requestUnlock'
import { localFileOrigin } from '@/packages/local-file-origin'
import { forkT as ft } from '@/i18n/fork'
import { LibraryFileInput } from '@/components/local-library/LibraryFileInput'
import { openVeniceDocumentation } from './VeniceModelInfo'
export function VeniceImageTools({catalog=[],process}:{catalog?:MediaCatalogItem[];process?:(input:{file:File;operation:ImageOperation;scale?:2|4;creativity?:number;protection?:string;title:string;catalog:MediaCatalogItem[]},signal:AbortSignal)=>Promise<ImageGeneration>}){
 const {i18n}=useTranslation(),[file,setFile]=useState<File|null>(null),[operation,setOperation]=useState<ImageOperation>('background-remove'),[scale,setScale]=useState<2|4>(2),[creativity,setCreativity]=useState(0.01),[protectedOutput,setProtected]=useState(false),[result,setResult]=useState<ImageGeneration|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const controller=useRef<AbortController|null>(null),origin=localFileOrigin(file)
 const [prices,setPrices]=useState(catalog)
 useEffect(()=>{const stop=()=>{controller.current?.abort();setFile(null);setResult(null);setError('')};window.addEventListener('chatbox:privacy-lock',stop);return()=>{controller.current?.abort();window.removeEventListener('chatbox:privacy-lock',stop)}},[])
 const price=(prices.find(item=>item.type==='upscale')?.model_spec?.pricing?.upscale as Record<string,{usd?:number;diem?:number}>|undefined)?.[scale+'x']
 const run=async()=>{if(!file)return;const task=new AbortController();controller.current=task;setBusy(true);setError('');setResult(null)
  try{const protection=protectedOutput?(origin?.scope&&origin.scope!=='public'?origin.scope:'app'):undefined;if(protection&&!await requestProtectedAccess(protection))return;task.signal.throwIfAborted();const start=process||(await import('@/packages/venice/image-processing')).runVeniceImageTool;const record=await start({file,operation,scale,creativity,protection,title:ft(operation==='upscale'?'Upscale image':'Remove background'),catalog},task.signal);task.signal.throwIfAborted();setResult(record)}catch(error){if(!task.signal.aborted)setError(imageToolError(error))}finally{if(controller.current===task){controller.current=null;setBusy(false)}}
 }
 return <Stack gap="md"><Title order={3}>{ft('Image tools')}</Title><Text size="sm" c="dimmed">{ft('Improve an existing image. Each action saves a new creation and keeps the original unchanged.')}</Text>
  <SegmentedControl aria-label={ft('Image operation')} value={operation} onChange={value=>{setOperation(value as ImageOperation);setError('')}} disabled={busy} data={[{value:'background-remove',label:ft('Remove background')},{value:'upscale',label:ft('Upscale image')}]}/>
  <LibraryFileInput cropImages clearable label={ft('Source image')} accept="image/png,image/jpeg,image/webp" value={file} disabled={busy} onChange={file=>{setFile(file);if(localFileOrigin(file)?.scope!=='public'&&localFileOrigin(file))setProtected(true)}}/>
  {operation==='upscale'&&<><SegmentedControl aria-label={ft('Upscale factor')} value={String(scale)} onChange={value=>setScale(Number(value) as 2|4)} disabled={busy} data={[{value:'2',label:'2×'},{value:'4',label:'4×'}]}/><Text size="sm">{ft('Added detail')}</Text><Slider aria-label={ft('Added detail')} min={0} max={0.02} step={0.001} value={creativity} onChange={setCreativity} disabled={busy}/><Text size="xs" c="dimmed">{ft('Output is limited to 16 megapixels. Venice may reduce the effective scale.')}</Text></>}
  <Paper withBorder p="sm" radius="md"><Text fw={600}>{ft('Pricing')}</Text>{operation==='upscale'&&typeof price?.usd==='number'?<Text size="lg" fw={700}>{formatPrice(price.usd,'USD',i18n.resolvedLanguage||'en')} · {scale}×</Text>:<Text size="sm">{ft('The provider has not supplied a price for this model. A missing price does not mean free.')}</Text>}<Group><Button variant="light" size="xs" disabled={busy} onClick={()=>void import('@/packages/venice/image-processing').then(module=>module.fetchImageToolCatalog()).then(setPrices).catch(error=>setError(ft(error.message)))}>{ft('Refresh image tool prices')}</Button><Button variant="subtle" size="xs" onClick={()=>void openVeniceDocumentation('https://docs.venice.ai/overview/pricing').catch(()=>setError(ft('Unable to open documentation. Use Open in browser.')))}>{ft('API pricing')}</Button></Group></Paper>
  <Checkbox label={ft('Save new creations as protected')} checked={protectedOutput} onChange={event=>setProtected(event.currentTarget.checked)} disabled={busy}/>
  <Alert color="blue">{ft('The selected image is sent to Venice over HTTPS. This image endpoint does not use text E2EE. The action may incur a charge.')}</Alert>
  {error&&<Alert color="red">{error}</Alert>}
  <Group><Button loading={busy} disabled={!file} onClick={()=>void run()}>{ft(operation==='upscale'?'Confirm and upscale':'Confirm and remove background')}</Button>{busy&&<Button variant="default" onClick={()=>controller.current?.abort()}>{ft('Stop')}</Button>}</Group>
  {result&&<Paper withBorder radius="md" p="sm"><Stack><Text fw={600}>{ft('Saved in the local media library')}</Text><ProtectedPreviewGate key={result.id} scope={result.protection}><ImageInStorage storageKey={result.generatedImages[0]} className="max-h-[55dvh] max-w-full object-contain"/></ProtectedPreviewGate><Button variant="subtle" onClick={()=>setResult(null)}>{ft('Close preview')}</Button></Stack></Paper>}
 </Stack>
}

function imageToolError(error:unknown){const message=error instanceof Error?error.message:String(error);const match=message.match(/^Venice image processing failed \(HTTP (\d+)\). No paid request was retried\.$/);return match?ft('Venice image processing failed (HTTP {{status}}). No paid request was retried.',{status:match[1]}):ft(message)}
