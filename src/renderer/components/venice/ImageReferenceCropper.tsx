import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { Alert,Button,Group,NumberInput,Stack,Text } from '@mantine/core'
import { useCallback,useEffect,useRef,useState,type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { imageDimensions } from '@/packages/image-thumbnail'
import { cropReferenceBitmap,draggedCrop,fitCrop,type CropRect } from '@/packages/venice/reference-crop'
import { inheritLocalFile } from '@/packages/local-file-origin'
import { forkT as ft } from '@/i18n/fork'
import { VeniceSettingSelect as Select } from './VeniceSettingSelect'
const full={x:0,y:0,width:100,height:100}
export const ImageReferenceCropper=NiceModal.create(({file}:{file:File})=>{
 useTranslation();const modal=useModal();usePrivacyDismiss(modal,null)
 const canvas=useRef<HTMLCanvasElement|null>(null),drag=useRef<{x:number;y:number}|null>(null),operation=useRef(new AbortController())
 const [canvasNode,setCanvasNode]=useState<HTMLCanvasElement|null>(null)
 const bindCanvas=useCallback((node:HTMLCanvasElement|null)=>{canvas.current=node;setCanvasNode(node)},[])
 const [bitmap,setBitmap]=useState<ImageBitmap|null>(null),[rect,setRect]=useState<CropRect>(full),[ratio,setRatio]=useState('free'),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let image:ImageBitmap|undefined;const controller=new AbortController();operation.current=controller
  void(async()=>{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>25*1024*1024)throw Error('Use a PNG, JPEG or WebP image up to 25 MB');const dimensions=imageDimensions(new Uint8Array(await file.slice(0,65536).arrayBuffer()));if(!dimensions||dimensions.width*dimensions.height>8000000)throw Error('Local cropping supports images up to 8 megapixels');controller.signal.throwIfAborted();image=await createImageBitmap(file);if(controller.signal.aborted){image.close();return}setBitmap(image)})().catch(error=>{if(!controller.signal.aborted)setError(ft(error.message))})
  return()=>{controller.abort();image?.close();if(canvas.current)canvas.current.width=canvas.current.height=1}
 },[file])
 useEffect(()=>{if(!bitmap||!canvas.current)return;const target=canvas.current,scale=Math.min(1,768/bitmap.width,768/bitmap.height);target.width=Math.max(1,Math.round(bitmap.width*scale));target.height=Math.max(1,Math.round(bitmap.height*scale));const context=target.getContext('2d')!;context.drawImage(bitmap,0,0,target.width,target.height);context.fillStyle='rgba(0,0,0,0.55)';context.fillRect(0,0,target.width,target.height);context.save();context.beginPath();context.rect(target.width*rect.x/100,target.height*rect.y/100,target.width*rect.width/100,target.height*rect.height/100);context.clip();context.clearRect(0,0,target.width,target.height);context.drawImage(bitmap,0,0,target.width,target.height);context.restore();context.strokeStyle='white';context.lineWidth=2;context.strokeRect(target.width*rect.x/100,target.height*rect.y/100,target.width*rect.width/100,target.height*rect.height/100)},[bitmap,rect,canvasNode])
 const position=(event:PointerEvent<HTMLCanvasElement>)=>{const bounds=event.currentTarget.getBoundingClientRect();return{x:(event.clientX-bounds.left)/bounds.width*100,y:(event.clientY-bounds.top)/bounds.height*100}}
 const change=(key:keyof CropRect,value:number|string)=>{const next={...rect,[key]:Number(value)||0};next.x=Math.max(0,Math.min(99.8,next.x));next.y=Math.max(0,Math.min(99.8,next.y));next.width=Math.max(.2,Math.min(100-next.x,next.width));next.height=Math.max(.2,Math.min(100-next.y,next.height));setRatio('free');setRect(next)}
 const confirm=async()=>{if(!bitmap)return;setBusy(true);setError('');try{const blob=await cropReferenceBitmap(bitmap,rect,operation.current.signal);modal.resolve(inheritLocalFile(file,new File([blob],file.name.replace(/\.[^.]+$/,'')+'-crop.png',{type:'image/png'})));modal.remove()}catch(error){if(!operation.current.signal.aborted)setError(ft(String(error instanceof Error?error.message:error)))}finally{setBusy(false)}}
 return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve(null);modal.remove()}} title={ft('Crop reference image')} size="lg"><Stack>
  <Text size="sm">{ft('Drag over the image to select an area. Cropping stays on this device and keeps the original unchanged.')}</Text>
  <Select label={ft('Crop ratio')} value={ratio} allowDeselect={false} data={[{value:'free',label:ft('Free crop')},{value:'original',label:ft('Original ratio')},...['1:1','4:3','3:4','16:9','9:16'].map(value=>({value,label:value}))]} onChange={value=>{if(!value)return;setRatio(value);if(bitmap&&value!=='free'){const target=value==='original'?bitmap.width/bitmap.height:Number(value.split(':')[0])/Number(value.split(':')[1]);setRect(fitCrop(full,bitmap.width/bitmap.height,target))}}}/>
  <Group justify="center"><canvas ref={bindCanvas} aria-label={ft('Reference crop area')} style={{maxWidth:'100%',maxHeight:'48dvh',width:'auto',height:'auto',touchAction:'none',cursor:'crosshair'}} onPointerDown={event=>{if(!bitmap||busy)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current=position(event)}} onPointerMove={event=>{if(!drag.current||!bitmap||busy)return;event.preventDefault();const aspect=ratio==='free'?undefined:ratio==='original'?bitmap.width/bitmap.height:Number(ratio.split(':')[0])/Number(ratio.split(':')[1]);const next=draggedCrop(drag.current,position(event),bitmap.width/bitmap.height,aspect);if(next)setRect(next)}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}/></Group>
  <Group grow wrap="wrap">{(['x','y','width','height'] as const).map(key=><NumberInput key={key} label={ft(({x:'Crop left (%)',y:'Crop top (%)',width:'Crop width (%)',height:'Crop height (%)'} as const)[key])} value={Number(rect[key].toFixed(1))} min={0} max={100} decimalScale={1} disabled={busy||!bitmap} onChange={value=>change(key,value)}/>)}</Group>
  {bitmap&&<Text size="xs" c="dimmed">{Math.max(1,Math.round(bitmap.width*rect.width/100))} × {Math.max(1,Math.round(bitmap.height*rect.height/100))} px · PNG</Text>}
  {error&&<Alert color="orange">{error}</Alert>}
  <Group justify="space-between"><Button variant="subtle" disabled={busy} onClick={()=>{setRatio('free');setRect(full)}}>{ft('Reset crop')}</Button><Group><Button variant="default" onClick={()=>{modal.resolve(null);modal.remove()}}>{ft('Cancel')}</Button><Button disabled={!bitmap} loading={busy} onClick={()=>void confirm()}>{ft('Use cropped image')}</Button></Group></Group>
 </Stack></AdaptiveModal>
})
export const cropReferenceFile=(file:File)=>NiceModal.show(ImageReferenceCropper,{file}) as Promise<File|null>
