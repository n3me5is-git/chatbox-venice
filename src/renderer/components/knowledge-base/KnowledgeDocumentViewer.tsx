import {OfficeDocumentViewer} from '@/components/common/OfficeDocumentViewer'
import {Alert,Button,Loader,Stack,Text} from '@mantine/core'
import {useEffect,useState,useSyncExternalStore} from 'react'
import type {KnowledgeCollections} from '@/packages/knowledge-collections/store'
import {PdfDocumentViewer} from '@/components/common/PdfDocumentViewer'
import {forkT as ft} from '@/i18n/fork'

export function KnowledgeDocumentViewer({store,id,fileId,onText}:{store:KnowledgeCollections;id:number;fileId:number;onText:(text:string)=>void}){
 const revision=useSyncExternalStore(store.vault.keys.subscribe,store.vault.keys.snapshot,store.vault.keys.snapshot),[state,setState]=useState<{revision:number;url?:string;name?:string;mime?:string;error?:string}>(),[loadingText,setLoadingText]=useState(false)
 useEffect(()=>{let active=true,url:string|undefined;setState(undefined);void(async()=>{try{await store.assert(id);const file=(await store.data(id)).files.find(file=>file.id===fileId);if(!file)throw Error('Knowledge document not found');const bytes=await store.source(id,file.path);try{await store.assert(id);if(!active)return;url=URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer],{type:file.mime}));setState({revision,url,name:file.name,mime:file.mime})}finally{bytes.fill(0)}}catch(error){if(active)setState({revision,error:(error as Error).message})}})();return()=>{active=false;if(url)URL.revokeObjectURL(url)}},[store,id,fileId,revision])
 const current=state?.revision===revision?state:undefined
 if(!current)return <Loader aria-label={ft('Loading document')}/>
 return <Stack gap="sm">{current.error&&<Alert role="alert" color="red">{ft(current.error)}</Alert>}{current.url&&(current.mime==='application/pdf'?<PdfDocumentViewer url={current.url} name={current.name||ft('Original document')}/>:<OfficeDocumentViewer url={current.url} name={current.name||'document.docx'}/>)}
  <Button variant="default" loading={loadingText} onClick={()=>{setLoadingText(true);void store.documentText(id,fileId).then(result=>onText(result.text)).catch(error=>setState({revision,error:(error as Error).message})).finally(()=>setLoadingText(false))}}>{ft('View extracted text')}</Button>
  <Text size="xs" c="dimmed">{ft('The original document is rendered locally. Extracted text is the representation used for search.')}</Text>
 </Stack>
}
