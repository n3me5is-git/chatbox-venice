import { Button, Stack } from '@mantine/core'
import { useMemo, useState } from 'react'
import type { MessageToolCallPart } from '../../src/shared/types'
import type { MediaRecord } from '../../src/shared/providers/definitions/models/venice/media'
import { buildVeniceMediaTools } from '../../src/shared/providers/definitions/models/venice/tools'
import { waitForMediaRecord } from '../../src/shared/providers/definitions/models/venice/media-wait'
import { AdaptiveModal } from '../../src/renderer/components/common/AdaptiveModal'
import { VeniceMediaArtifacts } from '../../src/renderer/components/venice/VeniceMediaArtifacts'
function wav(){const rate=8000,bytes=new Uint8Array(44+rate*2),view=new DataView(bytes.buffer);for(const[offset,text]of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']] as const)bytes.set(new TextEncoder().encode(text),offset);view.setUint32(4,bytes.length-8,true);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);view.setUint32(40,rate*2,true);return bytes}
async function video(){const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const context=canvas.getContext('2d')!,stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks:Blob[]=[];context.fillStyle='blue';context.fillRect(0,0,32,32);const interval=setInterval(()=>{context.fillStyle=context.fillStyle==='blue'?'green':'blue';context.fillRect(0,0,32,32)},80);return new Promise<Uint8Array>((resolve,reject)=>{recorder.ondataavailable=event=>chunks.push(event.data);recorder.onerror=()=>{clearInterval(interval);stream.getTracks().forEach(track=>track.stop());reject(Error('Local video fixture failed'))};recorder.onstop=()=>{clearInterval(interval);stream.getTracks().forEach(track=>track.stop());void new Blob(chunks,{type:'video/webm'}).arrayBuffer().then(buffer=>resolve(new Uint8Array(buffer)),reject)};recorder.start();setTimeout(()=>recorder.stop(),650)})}
const part=(id:string,kind='music')=>({type:'tool-call',toolName:'venice_media',toolCallId:'show-'+id,state:'result',args:{action:'show',id},result:{id,kind,artifact:{type:'venice_media',recordId:id}}}) as MessageToolCallPart
export function MediaArtifactsReviewSimulation(){
 const [opened,setOpened]=useState(false),[parts,setParts]=useState<MessageToolCallPart[]>([]),[ready,setReady]=useState(false)
 const fixture=useMemo(()=>{
  const listeners=new Set<()=>void>(),files=new Map<string,Uint8Array>();let rows:MediaRecord[]=[]
  const list=async()=>structuredClone(rows),subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
  const forbidden=async()=>{(window as any).__mediaProviderCalls++;throw Error('No provider request is allowed by this fixture')}
  const service={list,subscribe,catalog:async()=>[],start:forbidden,quote:forbidden,resume:forbidden,pause:forbidden,remove:forbidden,cleanup:forbidden,waitFor:(id:string,ms:number,signal?:AbortSignal)=>waitForMediaRecord({read:async()=>(await list()).find(row=>row.id===id)||null,subscribe},ms,signal)}
  const api={read:async(_id:string,item:any)=>{(window as any).__mediaPreviewReads++;const bytes=files.get(item.key);if(!bytes)throw Error('Missing local fixture');return {file:item,bytes:bytes.slice()}},export:async()=>{}}
  const make=(id:string,kind:'music'|'video',status:'queued'|'ready'='ready'):MediaRecord=>({id,sessionId:'media-chat',kind,model:'local-fixture',prompt:id,createdAt:1,status,origin:'https://example.com',credentialId:'synthetic',blobKey:status==='ready'?id:undefined,mime:kind==='video'?'video/webm':'audio/wav'})
  return{service,api,prepare:async()=>{files.set('audio',wav());files.set('queued',wav());files.set('video',await video());rows=[make('audio','music'),make('video','video'),make('queued','music','queued')]},complete:()=>{rows=rows.map(row=>row.id==='queued'?{...row,status:'ready',blobKey:'queued'}:row);for(const listener of listeners)listener()}}
 },[])
 ;(window as any).__completeQueuedMedia=fixture.complete
 const open=async()=>{(window as any).__mediaPreviewReads=0;(window as any).__mediaProviderCalls=0;await fixture.prepare();setParts([part('audio'),part('video','video'),part('queued')]);setReady(true);setOpened(true)}
 const recall=async()=>{const tools=buildVeniceMediaTools('media-chat',fixture.service as any,()=>({chatToolsEnabled:true,audioEnabled:true}),async()=>false);const result=await tools.venice_media.execute!({action:'show',id:'audio'},{toolCallId:'recall',messages:[]});setParts([{...part('audio'),result}])}
 return <><Button m="sm" onClick={()=>void open()}>Test media artifact players</Button><AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title="Chat media artifact regression"><Stack>{ready&&<VeniceMediaArtifacts parts={parts} sessionId="media-chat" service={fixture.service} api={fixture.api}/>}<Button onClick={()=>void recall()}>Recall saved music</Button><Button onClick={()=>setOpened(false)}>Close media artifact test</Button></Stack></AdaptiveModal></>
}
