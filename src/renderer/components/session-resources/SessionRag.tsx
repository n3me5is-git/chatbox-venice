import {RagMediaOptions} from '@/components/knowledge-base/RagMediaOptions'
import type {sessionResourceAPI} from '@/packages/session-resources/api'
import { Alert, Badge, Button, Checkbox, Group, Loader, NumberInput, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { RagSettingsSchema, type RagSettings, type RagIndex } from '@shared/session-rag'
import type { FolderReply } from '@shared/linked-folder'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { ModelSelectorV2 } from '@/components/ModelSelectorV2'
import { forkT as ft } from '@/i18n/fork'
import { SessionResources } from './SessionResources'
import { linkedFolderAvailable, linkedFolderOperation } from '@/packages/session-resources/linked-folder'
import { multimodalEmbedding } from '@/packages/session-rag/embeddings'
import * as ragService from '@/packages/session-rag/service'

export function SessionRagPanel({sessionId,service=ragService,resourceAPI}:{sessionId:string;service?:typeof ragService;resourceAPI?:typeof sessionResourceAPI}){
  useTranslation()
  const [settings,setSettings]=useState<RagSettings>(),[index,setIndex]=useState<RagIndex|null>(null),[authorized,setAuthorized]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[folder,setFolder]=useState<FolderReply>(),[query,setQuery]=useState(''),[hits,setHits]=useState<Awaited<ReturnType<typeof ragService.searchSessionRag>>>(),[preview,setPreview]=useState<string>(),[ack,setAck]=useState(false)
  const job=useSyncExternalStore(service.subscribeRag,()=>service.ragJob(sessionId)?.path??(service.ragJob(sessionId)?'':''),()=>'')
  const running=!!service.ragJob(sessionId)
  const load=async()=>{const result=await service.ragStatus(sessionId);setSettings(result.settings);setIndex(result.index);setAuthorized(result.authorized);setError(result.error||'');const status=await linkedFolderOperation({sessionId,action:'status'});setFolder(status.linked?await linkedFolderOperation({sessionId,action:'list',bindingId:status.bindingId}):status)}
  useEffect(()=>{const refresh=()=>{if(!document.hidden)void load().catch(e=>setError(e.message))};refresh();document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh)},[sessionId])
  useEffect(()=>service.subscribeRagPrivacy?.(sessionId,()=>{setHits(undefined);setPreview(undefined);setIndex(null);setAuthorized(false);setSettings(undefined);setError('Unlock this chat to use RAG')}),[sessionId,service])
  const update=(change:Partial<RagSettings>)=>{setSettings(value=>value?{...value,...change}:value);setAck(false);setAuthorized(false)}
  const run=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await work()}catch(e){setError(String((e as Error).message))}finally{setBusy(false)}}
  if(!settings)return error?<Alert color="red">{ft(error)}</Alert>:<Loader size="sm"/>
  const multimodal=multimodalEmbedding(settings.provider,settings.model)
  return <Stack gap="sm" style={{minWidth:0}}>
    {error&&<Alert color="red" role="alert">{ft(error)}</Alert>}
    <Text size="sm">{ft('Search this chat’s files by meaning. The index stays encrypted in the session tree. Text or selected media are sent to the embedding provider; OCR sends images to its selected model.')}</Text>
    <Switch label={ft('Enable session RAG')} checked={settings.enabled} onChange={e=>update({enabled:e.currentTarget.checked})}/>
    <Text size="sm" fw={500}>{ft('Embedding model')}</Text>
    <ModelSelectorV2 withinPortal={false} selectedProviderId={settings.provider} selectedModelId={settings.model} modelFilter={model=>model.type==='embedding'||/embedding/i.test(model.modelId)} onSelect={(provider,model)=>update({provider,model,images:settings.images&&multimodalEmbedding(provider,model),audio:settings.audio&&multimodalEmbedding(provider,model)})}><Button variant="default" fullWidth style={{height:'auto',whiteSpace:'normal',minHeight:36}}>{settings.model||ft('Choose an embedding model')}</Button></ModelSelectorV2>
    <NumberInput label={ft('Vector dimensions (optional)')} description={ft('Leave empty to use the model default. Changing dimensions requires rebuilding the index.')} value={settings.dimensions??''} min={128} max={8192} allowDecimal={false} onChange={value=>update({dimensions:typeof value==='number'?value:undefined})}/>
    <Switch label={ft('Automatically update changed files')} description={ft('Checks the tree while the app is open and unlocked. Unchanged file hashes reuse their embeddings. A failed unchanged tree is not retried automatically.')} checked={settings.auto} onChange={e=>update({auto:e.currentTarget.checked})}/>
    <RagMediaOptions value={settings} update={update} session/>
    <Textarea label={ft('Excluded folders or paths')} description={ft('One name or relative path per line. The RAG index and private agent folders are always excluded.')} minRows={3} autosize maxRows={6} value={settings.exclude.join('\n')} onChange={e=>update({exclude:e.currentTarget.value.split('\n').map(s=>s.trim()).filter(Boolean)})}/>
    {settings.enabled&&<Checkbox label={ft('I allow the selected embedding/OCR/STT providers to process the enabled content. Their privacy level may differ from this chat model.')} checked={ack} onChange={e=>setAck(e.currentTarget.checked)}/>}
    <Group wrap="wrap"><Button loading={busy} disabled={settings.enabled&&!ack} onClick={()=>void run(async()=>{await service.configureRag(sessionId,RagSettingsSchema.parse(settings));await load();setAck(false)})}>{ft('Save RAG settings')}</Button><Button variant="light" disabled={busy||running||!authorized||!settings.enabled} onClick={()=>void run(async()=>{await service.indexSessionRag(sessionId);await load()})}>{ft('Index now')}</Button><Button variant="default" disabled={busy||running||!authorized||!settings.enabled} onClick={()=>{if(window.confirm(ft('Rebuild all vectors with the saved settings? This sends documents to the selected providers again.')))void run(async()=>{await service.indexSessionRag(sessionId,true);await load()})}}>{ft('Rebuild RAG index')}</Button>{running&&<Button color="red" variant="subtle" onClick={()=>service.cancelSessionRag(sessionId)}>{ft('Stop indexing')}</Button>}<Button color="red" variant="subtle" disabled={busy||running} onClick={()=>{if(window.confirm(ft('Delete the local RAG index? Source files are kept.')))void run(async()=>{await service.clearSessionRag(sessionId);await load()})}}>{ft('Clear index')}</Button></Group>
    {running&&<Text size="sm" role="status">{ft('Indexing file')}: {job}</Text>}
    {index&&<><Group gap="xs"><Badge>{index.files.length} {ft('Indexed files')}</Badge><Badge>{index.files.reduce((n,file)=>n+file.chunks,0)} {ft('Passages')}</Badge><Text size="xs">{new Date(index.updated).toLocaleString()}</Text></Group>{index.files.filter(file=>file.warning).map(file=><Alert color="yellow" key={file.path}>{file.path}: {ft(file.warning!)}</Alert>)}{index.errors.map((row,n)=><Alert color="red" key={row.path+n}>{row.path}: {ft(row.error)}</Alert>)}</>}
    <TextInput label={ft('Try semantic search')} value={query} onChange={e=>setQuery(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault()}}/>
    <Button variant="light" disabled={busy||!query.trim()||!authorized} onClick={()=>void run(async()=>setHits(await service.searchSessionRag(sessionId,query,new AbortController().signal)))}>{ft('Search indexed files')}</Button>
    {hits?.stale&&<Alert color="yellow">{ft('Some sources changed. Update the index before using their passages.')}</Alert>}
    {hits?.matches.map(hit=><Button key={hit.id} variant="default" style={{height:'auto',whiteSpace:'normal',textAlign:'left'}} onClick={()=>setPreview(hit.path)}><Stack gap={2} py="xs"><Text size="sm" fw={600}>{hit.path} · {hit.page?ft('Page')+' '+hit.page:ft('Lines')+' '+hit.line+'–'+hit.endLine}</Text><Text size="xs">{hit.snippet||hit.modality}</Text></Stack></Button>)}
    {linkedFolderAvailable()&&<><Text fw={600}>{ft('Linked workspace folder')}</Text><Text size="sm">{ft('Linking replaces the main file tree with a real device folder. Existing app files are kept for when you disconnect. Files in this folder are not encrypted by the app. App/project locks still control access through Chatbox.')}</Text>{!!folder?.skipped?.length&&<Alert color="yellow">{ft('Files larger than 10 MB were skipped')}: {folder!.skipped!.join(', ')}</Alert>}{folder?.linked&&<Text size="sm">{ft('Linked folder')}: {folder.name}</Text>}<Group><Button variant="default" disabled={busy||running} onClick={()=>{if(window.confirm(ft('Allow this chat to read, create, edit and delete files in a selected folder?')))void run(async()=>{await linkedFolderOperation({sessionId,action:'pick'});await load()})}}>{ft('Choose device folder')}</Button><Button variant="subtle" disabled={busy||running||!folder?.linked} onClick={()=>void run(async()=>{await linkedFolderOperation({sessionId,action:'unlink'});await load()})}>{ft('Use app storage')}</Button></Group><Text size="xs" c="dimmed">{ft('Dedicated agents use separate app-scoped subfolders. The caller cannot browse them directly. Disconnecting or deleting a chat keeps the external files.')}</Text></>}
    <AdaptiveModal opened={!!preview} onClose={()=>setPreview(undefined)} title={ft('Files and resources')} size="xl"><div style={{height:'72dvh'}}>{preview&&<SessionResources sessionId={sessionId} initialPath={preview} api={resourceAPI}/>}</div></AdaptiveModal>
  </Stack>
}
