import { useCallback,useEffect,useRef,useState } from 'react'
import { Alert,Button,Group,Image,Loader,Select,Stack,Text,TextInput } from '@mantine/core'
import type { GuestShare } from '@/packages/collaboration/hub'
import type { SharedFile } from '@shared/collaboration'
import { readRasterImageBounds } from '@shared/image-dimensions'
import { collaboration } from '@/packages/collaboration/runtime'
import { collaborationError } from '@/packages/collaboration/errors'
import { Drawer } from '@/components/layout/Overlay'
import { MarkdownFilePreview } from '@/components/session-resources/MarkdownFilePreview'
import { buildWorkArtifactPreview } from '@shared/mobile-work/artifact-preview'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'

const MAX_PREVIEW=64*1024*1024
export async function remotePreview(roomId:string,file:SharedFile,signal:AbortSignal){
  if((file.bytes??0)>MAX_PREVIEW)throw Error('This file is too large for a shared preview. Clone the chat to open it locally.')
  const chunks:Uint8Array<ArrayBuffer>[]= [];let length=0
  try{
    for await(const bytes of collaboration.readFile(roomId,file.id,false,signal)){length+=bytes.length;if(length>MAX_PREVIEW)throw Error('This file is too large for a shared preview. Clone the chat to open it locally.');chunks.push(bytes.slice())}
    signal.throwIfAborted();if(file.bytes!==undefined&&length!==file.bytes)throw Error('Shared file size changed during import')
    const blob=new Blob(chunks,{type:file.mime})
    if(file.mime.startsWith('image/')){const bytes=new Uint8Array(await blob.arrayBuffer());try{const bounds=readRasterImageBounds(bytes,file.mime);if(!bounds||bounds.maxPixels>32000000||bounds.maxWidth>8192||bounds.maxHeight>8192)throw Error('This image is too large or unsupported for a shared preview. Clone the chat to open it locally.')}finally{bytes.fill(0)}}
    return blob
  }finally{for(const bytes of chunks)bytes.fill(0)}
}
export function RemoteFiles({room,opened,initial,onClose}:{room:GuestShare;opened:boolean;initial?:SharedFile;onClose:()=>void}){
  const [selected,setSelected]=useState<SharedFile>(),[search,setSearch]=useState(''),[kind,setKind]=useState('all'),[preview,setPreview]=useState<{url?:string;text?:string}>(),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  const active=useRef<AbortController>(),reads=useRef<Promise<unknown>>(Promise.resolve()),files=room.snapshot?.files||[]
  const read=useCallback((file:SharedFile,signal:AbortSignal)=>{const work=reads.current.catch(()=>{}).then(()=>{signal.throwIfAborted();return remotePreview(room.id,file,signal)});reads.current=work;return work},[room.id])
  const resolveImage=useCallback(async(path:string)=>{const file=files.find(file=>file.path===path),controller=active.current;if(!file?.mime.startsWith('image/')||!controller)return;const blob=await read(file,controller.signal);controller.signal.throwIfAborted();return URL.createObjectURL(blob)},[files,read])
  useEffect(()=>{if(opened)setSelected(initial)},[initial,opened])
  const current=files.find(file=>file.id===selected?.id)
  useEffect(()=>{
    setPreview(undefined);setError('');setLoading(false);if(!opened||!current||room.status!=='connected')return
    const controller=new AbortController();active.current=controller;let url:string|undefined;setLoading(true)
    void read(current,controller.signal).then(async blob=>{
      if(controller.signal.aborted)return
      if(current.mime.startsWith('text/')||/\.(md|markdown|json|js|ts|py|csv|yaml|yml|txt|html)$/i.test(current.name)){if(blob.size>2*1024*1024)throw Error('File is too large for text preview');const text=await blob.text();if(!controller.signal.aborted)setPreview({text})}
      else if(/^(image|audio|video)\//.test(current.mime)||current.mime==='application/pdf'){url=URL.createObjectURL(blob);setPreview({url})}
      else throw Error('Clone this chat to open this file with your device.')
    }).catch(error=>{if(!controller.signal.aborted)setError(collaborationError(error))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>{controller.abort();if(url)URL.revokeObjectURL(url)}
  },[current?.id,opened,room.id,room.status,read])
  return <Drawer opened={opened} onClose={onClose} position="right" size="min(720px, 100vw)" title={ft('Shared files')} styles={{body:{height:'calc(100% - 64px)',overflowY:'auto',overscrollBehavior:'contain',paddingBottom:'max(16px, env(safe-area-inset-bottom))'}}>
    <Stack gap="sm" style={{minWidth:0}}>
      <Text size="xs" c="dimmed">{ft('Files stay on the host and are loaded only when opened. Close the preview to release it.')}</Text>
      <TextInput aria-label={ft('Search shared files')} placeholder={ft('Search shared files')} value={search} onChange={event=>setSearch(event.currentTarget.value)}/>
      <Select label={ft('Category')} comboboxProps={{withinPortal:false}} allowDeselect={false} value={kind} onChange={value=>setKind(value||'all')} data={[['all','All files'],['image','Images'],['video','Video'],['audio','Audio'],['document','Documents']].map(([value,label])=>({value,label:ft(label)}))}/>
      <Stack gap={2} style={{maxHeight:'28dvh',overflowY:'auto',flexShrink:0}}>{files.filter(file=>(!search||file.path.toLowerCase().includes(search.toLowerCase()))&&(kind==='all'||(kind==='document'?!/^(image|audio|video)\//.test(file.mime):file.mime.startsWith(kind+'/')))).map(file=><Button key={file.id} variant={current?.id===file.id?'light':'subtle'} justify="start" onClick={()=>setSelected(file)} styles={{label:{whiteSpace:'normal',overflowWrap:'anywhere',textAlign:'start'},root:{height:'auto',minHeight:36,flexShrink:0}}}>{file.path}</Button>)}</Stack>
      {!files.length&&<Text c="dimmed">{ft('No shared files yet')}</Text>}
      {selected&&!current&&<Alert color="yellow">{ft('This file changed or was deleted. Refresh the shared chat.')}</Alert>}
      {current&&<Group justify="space-between"><Text fw={600} style={{overflowWrap:'anywhere',minWidth:0}}>{current.name}</Text><Button variant="subtle" onClick={()=>{active.current?.abort();setSelected(undefined)}}>{ft('Close preview')}</Button></Group>}
      {loading&&<Loader aria-label={ft('Loading file')}/>}{error&&<Alert color="red" role="alert">{ft(error)}</Alert>}
      {current&&preview?.text!==undefined? /\.(md|markdown)$/i.test(current.name)?<MarkdownFilePreview source={preview.text} path={current.path} resolveImage={resolveImage} openFile={path=>setSelected(files.find(file=>file.path===path))} openExternal={url=>void platform.openLink(url)}/>:current.mime==='text/html'?<iframe title={ft('Local file preview')} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={buildWorkArtifactPreview(preview.text)} style={{width:'100%',height:'60dvh',border:0}}/>:<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.text}</pre>
        :current&&preview?.url?current.mime.startsWith('image/')?<Image src={preview.url} alt={current.name} fit="contain" mah="65dvh"/>:current.mime.startsWith('audio/')?<audio src={preview.url} controls style={{width:'100%'}}/>:current.mime.startsWith('video/')?<video src={preview.url} controls style={{maxWidth:'100%',maxHeight:'65dvh'}}/>:<iframe title={current.name} sandbox="" src={preview.url} style={{width:'100%',height:'65dvh',border:0}}/>:null}
    </Stack>
  </Drawer>
}
