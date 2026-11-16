import {Alert,Button,Group,Loader,NumberInput,Stack,Text} from '@mantine/core'
import {useEffect,useRef,useState} from 'react'
import type {PDFDocumentProxy,RenderTask} from 'pdfjs-dist'
import {loadPdfjs} from '@/packages/pdf-parser'
import {forkT as ft} from '@/i18n/fork'

/** Local PDF.js rendering works in Android WebViews without a browser PDF plugin.
 * Keep one bounded page canvas alive; closing or changing the source destroys its worker. */
export function PdfDocumentViewer({url,name,initialPage=1}:{url:string;name:string;initialPage?:number}){
 const [document,setDocument]=useState<PDFDocumentProxy>(),[page,setPage]=useState(initialPage),[zoom,setZoom]=useState(1),[width,setWidth]=useState(320),[busy,setBusy]=useState(true),[error,setError]=useState('')
 const container=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),renderTask=useRef<RenderTask>()
 useEffect(()=>{let active=true,task:ReturnType<Awaited<ReturnType<typeof loadPdfjs>>['getDocument']>|undefined;setDocument(undefined);setError('');setBusy(true)
  void loadPdfjs().then(pdf=>{if(!active)return;task=pdf.getDocument({url,disableAutoFetch:true,disableStream:true});return task.promise}).then(pdf=>{if(active&&pdf){setDocument(pdf);setPage(Math.min(pdf.numPages,Math.max(1,initialPage)))}}).catch(error=>{if(active){setError((error as Error).message);setBusy(false)}})
  return()=>{active=false;renderTask.current?.cancel();void task?.destroy()}
 },[url,initialPage])
 useEffect(()=>{const element=container.current;if(!element)return;const update=()=>setWidth(Math.max(120,element.clientWidth-4));update();const observer=new ResizeObserver(update);observer.observe(element);return()=>observer.disconnect()},[])
 useEffect(()=>{if(!document||!canvas.current)return;let active=true;setBusy(true);setError('')
  void document.getPage(page).then(async pdfPage=>{if(!active)return;const base=pdfPage.getViewport({scale:1}),scale=width/base.width*zoom,viewport=pdfPage.getViewport({scale}),pixelRatio=Math.min(devicePixelRatio||1,2,Math.sqrt(4_000_000/(viewport.width*viewport.height))),element=canvas.current!;element.width=Math.max(1,Math.floor(viewport.width*pixelRatio));element.height=Math.max(1,Math.floor(viewport.height*pixelRatio));element.style.width=viewport.width+'px';element.style.height=viewport.height+'px';const task=pdfPage.render({canvas:element,viewport,transform:pixelRatio===1?undefined:[pixelRatio,0,0,pixelRatio,0,0]});renderTask.current=task;try{await task.promise;if(active)setBusy(false)}finally{pdfPage.cleanup()}}).catch(error=>{if(active&&error.name!=='RenderingCancelledException'){setError((error as Error).message);setBusy(false)}})
  return()=>{active=false;renderTask.current?.cancel()}
 },[document,page,width,zoom])
 return <Stack gap="sm" data-testid="pdf-document-viewer"><Text fw={600} style={{overflowWrap:'anywhere'}}>{name}</Text>
  <div className="feature-actions"><Button variant="default" disabled={!document||page<=1} onClick={()=>setPage(page-1)}>{ft('Previous page')}</Button><Button variant="default" disabled={!document||page>=document.numPages} onClick={()=>setPage(page+1)}>{ft('Next page')}</Button></div>
  <Group gap="sm" grow><NumberInput label={ft('Page')} min={1} max={document?.numPages||1} value={page} disabled={!document} onChange={value=>{if(typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=(document?.numPages||1))setPage(value)}}/><NumberInput label={ft('Zoom (%)')} min={50} max={250} step={25} value={zoom*100} onChange={value=>{if(typeof value==='number')setZoom(Math.min(2.5,Math.max(.5,value/100)))}}/></Group>
  {document&&<Text size="xs">{ft('Page')} {page} / {document.numPages}</Text>}{busy&&<Loader size="sm" aria-label={ft('Loading document')}/>} {error&&<Alert role="alert" color="red">{error}</Alert>}
  <div ref={container} role="region" aria-label={ft('Original document')} tabIndex={0} style={{maxWidth:'100%',height:'58dvh',minHeight:180,overflow:'auto',overscrollBehavior:'contain',touchAction:'auto',background:'#ccc'}}><canvas ref={canvas} aria-label={name} style={{display:'block',margin:'0 auto',background:'white'}}/></div>
 </Stack>
}
