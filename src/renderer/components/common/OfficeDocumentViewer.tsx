import {Alert,Loader,Stack,Text} from '@mantine/core'
import {useEffect,useState} from 'react'
import {parseRagDocument} from '@/packages/session-rag/document-parser'
import {MarkdownFilePreview} from '@/components/session-resources/MarkdownFilePreview'
import platform from '@/platform'
import {forkT as ft} from '@/i18n/fork'

export const isOfficePreview=(name:string)=>/\.(docx|xlsx|pptx|odt|ods|odp|rtf)$/i.test(name)
/** Read-only content preview uses the same bounded local worker as document indexing. */
export function OfficeDocumentViewer({url,name}:{url:string;name:string}){
 const [state,setState]=useState<{url:string;text?:string;truncated?:boolean;error?:string}>()
 useEffect(()=>{const controller=new AbortController();setState(undefined);void(async()=>{let bytes:Uint8Array|undefined;try{if(!url.startsWith('blob:'))throw Error('Only local document previews are allowed');const response=await fetch(url,{signal:controller.signal}),blob=await response.blob();if(blob.size>50*1024*1024)throw Error('File exceeds the 50 MB preview limit');bytes=new Uint8Array(await blob.arrayBuffer());const parsed=await parseRagDocument(name,bytes,controller.signal);controller.signal.throwIfAborted();setState({url,text:parsed.text,truncated:parsed.truncated})}catch(error){if(!controller.signal.aborted)setState({url,error:(error as Error).message})}finally{if(bytes?.byteLength)bytes.fill(0)}})();return()=>controller.abort()},[url,name])
 const current=state?.url===url?state:undefined
 return <Stack gap="sm" data-testid="office-document-viewer"><Text fw={600} style={{overflowWrap:'anywhere'}}>{name}</Text><Text size="xs" c="dimmed">{ft('Local read-only content preview. Original Office pagination and formatting may differ.')}</Text>{!current&&<Loader aria-label={ft('Loading document')}/>} {current?.error&&<Alert color="red" role="alert">{current.error}</Alert>}{current?.truncated&&<Alert color="yellow">{ft('This preview reached the document parser limit. Export the original to view all content.')}</Alert>}{current?.text!==undefined&&<MarkdownFilePreview source={current.text} path={name} resolveImage={async()=>undefined} openFile={()=>{}} openExternal={url=>void platform.openLink(url)}/>}</Stack>
}
