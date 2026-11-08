import { Alert, Badge, Button, Group, Loader, Paper, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconClock, IconPlayerPlay } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MessageToolCallPart } from '@shared/types'
import type { MediaRecord, VeniceMediaService } from '@shared/providers/definitions/models/venice/media'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { ProtectedPreviewGate } from '@/components/security/ProtectedPreviewGate'
import { LocalMediaViewer } from '@/components/session-resources/LocalMediaViewer'
import { sessionResourceAPI } from '@/packages/session-resources/api'
import { mediaArtifactIds, mediaArtifactResource } from '@/packages/venice/media-artifacts'
import { veniceMediaService } from '@/packages/venice/service'
import { installedVaultFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { forkT as ft } from '@/i18n/fork'
import { categoryLabels } from './model-labels'
import { GenerationFailureReason } from './GenerationFailureReason'

type Service=Pick<VeniceMediaService,'list'|'subscribe'>
type API=Pick<typeof sessionResourceAPI,'read'|'export'>
export function VeniceMediaArtifacts({parts,sessionId,service=veniceMediaService,api=sessionResourceAPI}:{parts:readonly MessageToolCallPart[];sessionId:string;service?:Service;api?:API}) {
  useTranslation()
  const ids=useMemo(()=>mediaArtifactIds(parts),[parts]),idKey=ids.join('|')
  const [records,setRecords]=useState<MediaRecord[]>([]),[error,setError]=useState('')
  const [selection,setSelection]=useState<{id:string;scope?:string}>()
  const selectionRef=useRef(selection);selectionRef.current=selection
  useEffect(()=>{
    setRecords([]);setSelection(undefined);setError('')
    if(!ids.length)return
    let active=true,epoch=0
    const refresh=async()=>{
      const ticket=++epoch
      try {
        const rows=(await service.list()).filter(row=>row.sessionId===sessionId&&ids.includes(row.id))
        if(!active||ticket!==epoch)return
        setRecords(rows);setError('')
        const selected=selectionRef.current
        if(selected&&!rows.some(row=>row.id===selected.id&&row.protection===selected.scope))setSelection(undefined)
      }catch{if(active&&ticket===epoch){setRecords([]);setSelection(undefined);setError(ft('Unable to read local content'))}}
    }
    const lock=()=>{epoch++;setRecords([]);setSelection(undefined);setError('')}
    const vault=installedVaultFor(platform)
    const keysChanged=()=>{epoch++;setRecords([]);const scope=selectionRef.current?.scope;if(scope&&!vault?.keys.isUnlocked(scope))setSelection(undefined);void refresh()}
    const stop=service.subscribe(()=>void refresh()),stopKeys=vault?.keys.subscribe(keysChanged)
    const changed=(event:Event)=>{if((event as CustomEvent).detail===sessionId)void refresh()}
    window.addEventListener('chatbox:privacy-lock',lock);window.addEventListener('session-resources:changed',changed)
    void refresh()
    return()=>{active=false;stop();stopKeys?.();window.removeEventListener('chatbox:privacy-lock',lock);window.removeEventListener('session-resources:changed',changed)}
  },[service,sessionId,idKey])
  const statuses={creating:'Starting',queued:'Processing',paused:'Paused',ready:'Ready',error:'Needs attention'}
  return <>
    {error&&<Alert color="red">{error}</Alert>}
    {records.map(record=><Paper key={record.id} data-media-artifact={record.id} withBorder radius="md" p="sm">
      <UnstyledButton disabled={record.status!=='ready'&&!record.protectedRecord} aria-label={ft('Open generated {{kind}}',{kind:ft(categoryLabels[record.kind]||record.kind)})} onClick={()=>setSelection({id:record.id,scope:record.protection})} style={{width:'100%',textAlign:'left'}}>
        <Group wrap="nowrap" gap="sm">{record.status==='ready'?<IconPlayerPlay size={24}/>:record.status==='queued'||record.status==='creating'?<Loader size="sm"/>:<IconClock size={24}/>}<Stack gap={3} style={{minWidth:0,flex:1}}><Text size="sm" fw={600}>{ft(categoryLabels[record.kind]||record.kind)}</Text><Text size="xs" lineClamp={2}>{record.protection?ft('Protected creation'):record.prompt||record.model}</Text></Stack><Badge size="xs" variant="light">{ft(statuses[record.status])}</Badge></Group>
      </UnstyledButton>
      {record.error&&<GenerationFailureReason error={record.error}/>}
    </Paper>)}
    <AdaptiveModal opened={!!selection} onClose={()=>setSelection(undefined)} title={ft('Media preview')} size="lg">
      {selection&&<ProtectedPreviewGate key={selection.id+':'+selection.scope} scope={selection.scope}><MediaArtifactPreview sessionId={sessionId} id={selection.id} scope={selection.scope} service={service} api={api}/></ProtectedPreviewGate>}
    </AdaptiveModal>
  </>
}

function MediaArtifactPreview({sessionId,id,scope,service,api}:{sessionId:string;id:string;scope?:string;service:Service;api:API}) {
  const [preview,setPreview]=useState<{url?:string;text?:string;resource?:ReturnType<typeof mediaArtifactResource>}>(),[error,setError]=useState('')
  useEffect(()=>{
    let active=true,owned=''
    setPreview(undefined);setError('')
    void (async()=>{
      const record=(await service.list()).find(row=>row.id===id&&row.sessionId===sessionId)
      if(!record||record.protectedRecord||record.protection!==scope)throw Error('This media is not available in this chat')
      if(record.status!=='ready')throw Error(record.error||'This generation is not ready yet')
      if(record.text&&!record.blobKey){if(record.text.length>2*1024*1024)throw Error('File is too large for text preview');if(active)setPreview({text:record.text});return}
      const resource=mediaArtifactResource(record,sessionId)
      const {bytes}=await api.read(sessionId,resource)
      try {
        if(!active)return
        const current=(await service.list()).find(row=>row.id===id&&row.sessionId===sessionId)
        if(!active)return
        if(!current||current.protectedRecord||current.protection!==scope)throw Error('This media is not available in this chat')
        if(resource.mime==='text/plain'){setPreview({text:new TextDecoder().decode(bytes),resource});return}
        if(!/^(audio|video|image)\//.test(resource.mime))throw Error('Preview unavailable for this file type')
        owned=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:resource.mime}));setPreview({url:owned,resource})
      }finally{bytes.fill(0)}
    })().catch(reason=>{if(active)setError(ft(reason instanceof Error?reason.message:'Unable to read local content'))})
    return()=>{active=false;if(owned)URL.revokeObjectURL(owned)}
  },[sessionId,id,scope,service,api])
  return <Stack>{error?<Alert color="red" role="alert">{error}</Alert>:!preview?<Loader aria-label={ft('Loading preview…')}/>:<>
    {preview.url&&preview.resource&&<LocalMediaViewer name={preview.resource.name} mime={preview.resource.mime} url={preview.url}/>}
    {preview.text&&<Text style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.text}</Text>}
    {preview.resource&&<Button variant="default" onClick={()=>void api.export(sessionId,preview.resource!).catch(()=>setError(ft('Unable to read local content')))}>{ft('Export')}</Button>}
  </>}</Stack>
}
