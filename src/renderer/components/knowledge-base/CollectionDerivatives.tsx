import {Alert,Button,Group,Loader,Select,Stack,Text} from '@mantine/core'
import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react'
import type {KnowledgeCollections} from '@/packages/knowledge-collections/store'
import {MarkdownFilePreview} from '@/components/session-resources/MarkdownFilePreview'
import {derivativeMarkdown} from '@shared/knowledge-derivatives'
import {forkT as ft} from '@/i18n/fork'
import platform from '@/platform'

export function CollectionDerivatives({store,id,fileId}:{store:KnowledgeCollections;id:number;fileId:number}){
 const revision=useSyncExternalStore(store.vault.keys.subscribe,store.vault.keys.snapshot,store.vault.keys.snapshot),[saved,setSaved]=useState<{revision:number;document:Awaited<ReturnType<KnowledgeCollections['documentText']>>}>(),[error,setError]=useState(''),[page,setPage]=useState('all'),[image,setImage]=useState<string>(),controller=useRef<AbortController>()
 const document=saved?.revision===revision?saved.document:undefined
 useEffect(()=>{const abort=new AbortController();controller.current=abort;setSaved(undefined);setError('');setImage(undefined);void store.documentText(id,fileId,abort.signal).then(document=>{if(!abort.signal.aborted)setSaved({revision,document})}).catch(error=>{if(!abort.signal.aborted)setError((error as Error).message)});return()=>abort.abort()},[store,id,fileId,revision])
 useEffect(()=>()=>{if(image)URL.revokeObjectURL(image)},[image])
 const resolveImage=useCallback(async(path:string)=>{const imageId=/^assets\/([a-f0-9]{64})\.(png|jpg|webp)$/.exec(path)?.[1],signal=controller.current?.signal;if(!imageId||!signal)return undefined;const asset=await store.derivedImage(id,fileId,imageId,signal);try{signal.throwIfAborted();await store.assert(id);signal.throwIfAborted();if(store.vault.keys.snapshot()!==revision)throw Error('Collection access changed');return URL.createObjectURL(new Blob([Uint8Array.from(asset.bytes).buffer],{type:asset.mime}))}finally{asset.bytes.fill(0)}},[store,id,fileId,revision])
 if(error)return <Alert color="yellow">{ft(error)}</Alert>
 if(!document)return <Loader aria-label={ft('Loading document')}/>
 const sections=document.text.split(/^==== Page (\d+) ====$/m),pages=sections.length>1?Array.from({length:(sections.length-1)/2},(_,i)=>Number(sections[i*2+1])):[],selected=page==='all'?pages[0]:Number(page),text=pages.length?sections[pages.indexOf(selected)*2+2]||'':document.text,assets=document.assets||[],visible=pages.length?assets.filter(asset=>asset.page===selected):assets
 return <Stack gap="md"><Text fw={600}>{document.name}</Text><Text size="xs" c="dimmed">{ft('Derived files stay with this collection and follow its protection and backup. Images load only for the selected page.')}</Text>{document.assetWarning&&<Alert color="yellow">{ft(document.assetWarning)}</Alert>}
  {pages.length>0&&<Select label={ft('Page')} value={String(selected)} allowDeselect={false} searchable comboboxProps={{withinPortal:false}} data={pages.map(n=>({value:String(n),label:ft('Page')+' '+n}))} onChange={value=>{if(value){setPage(value);setImage(undefined)}}}/>}
  <MarkdownFilePreview source={derivativeMarkdown(text,visible)} path="document.md" resolveImage={resolveImage} openFile={()=>{}} openExternal={url=>void platform.openLink(url)}/>
  <Text fw={500}>{ft('Derived image assets')} · {assets.length}</Text>{!assets.length&&<Text size="sm" c="dimmed">{ft('No saved image assets. Enable image retention and update the index; existing OCR text can be reused.')}</Text>}
  <Group>{visible.map((asset,n)=><Button key={asset.id+':'+n} size="xs" variant="default" onClick={()=>void resolveImage('assets/'+asset.id+'.'+(asset.mime==='image/jpeg'?'jpg':asset.mime==='image/webp'?'webp':'png')).then(value=>{if(store.vault.keys.snapshot()!==revision||controller.current?.signal.aborted){if(value)URL.revokeObjectURL(value);return}setImage(value)}).catch(error=>setError((error as Error).message))}>{ft(asset.kind==='page'?'Page preview':'Document image')} {asset.page||n+1}</Button>)}</Group>
  {image&&<img src={image} alt={ft('Derived image assets')} style={{maxWidth:'100%',height:'auto'}}/>}
 </Stack>
}
