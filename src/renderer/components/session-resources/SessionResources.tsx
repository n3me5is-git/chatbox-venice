import { ActionIcon, Alert, Badge, Button, Checkbox, FileButton, Group, Loader, MultiSelect, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { IconArrowLeft, IconDownload, IconFile, IconFilePlus, IconFolder, IconRefresh, IconTrash, IconUpload } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_RESOURCE_PREVIEW_BYTES, isTextResource, resourceMime, resourceTree, sessionFilePath, type ResourceTree, type SessionResource } from '@shared/session-resources'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { buildWorkArtifactPreview } from '@shared/mobile-work/artifact-preview'
import { registerBackSurface } from '@/packages/overlay-back'
import { sessionFiles } from '@/packages/session-resources/files'
import { exportSessionResource, listSessionResources, readSessionResource, removeSessionResource, saveSessionResource, subscribeSessionResources } from '@/packages/session-resources/service'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { MarkdownFilePreview } from './MarkdownFilePreview'
import { executeSessionCode } from '@shared/session-workspace-execution'
import { capacitorExecution } from '@/packages/mobile-work-mode/execution-service'

export const sessionResourceAPI={
  list:listSessionResources,read:readSessionResource,remove:removeSessionResource,save:saveSessionResource,export:exportSessionResource,subscribe:subscribeSessionResources,
  configure:(id:string,enabled:boolean)=>sessionFiles.tools(id,enabled),
  execute:(id:string,code:string,paths:string[],signal:AbortSignal)=>executeSessionCode(sessionFiles,capacitorExecution,id,code,paths,signal),
  create:async(id:string,path:string,bytes:Uint8Array,mime?:string)=>sessionFiles.write(id,path,bytes,{mime}),
  deliver:async(id:string,item:SessionResource)=>{
    if(item.origin==='file')return sessionFiles.deliver(id,item.path,!item.deliverable)
    const {bytes}=await readSessionResource(id,item)
    return sessionFiles.write(id,'deliverables/'+crypto.randomUUID().slice(0,8)+'-'+item.name.replace(/[\\/:*?"<>|%\u0000-\u001f]/g,'_'),bytes,{mime:item.mime,deliverable:true})
  },
}
type API=typeof sessionResourceAPI
export function SessionResources({sessionId,api=sessionResourceAPI}:{sessionId:string;api?:API}){
  useTranslation()
  const [items,setItems]=useState<SessionResource[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[truncated,setTruncated]=useState(false)
  const [selected,setSelected]=useState<SessionResource>(),[text,setText]=useState(''),[url,setUrl]=useState(''),[opening,setOpening]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState('')
  const [busy,setBusy]=useState(false),[deleting,setDeleting]=useState<SessionResource>(),[creating,setCreating]=useState(false),[newPath,setNewPath]=useState('notes.md')
  const [toolsEnabled,setToolsEnabled]=useState(true),[executing,setExecuting]=useState(false),[code,setCode]=useState(''),[inputPaths,setInputPaths]=useState<string[]>([]),[result,setResult]=useState('')
  const executionAbort=useRef<AbortController>()
  const request=useRef<AbortController>(),imageBudget=useRef(0)
  const clear=useCallback(()=>{setSelected(undefined);setText('');setDraft('');setEditing(false);setUrl('');imageBudget.current=0},[])
  const load=useCallback(()=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true)
    void api.list(sessionId,controller.signal).then(result=>{if(!controller.signal.aborted){setItems(result.items);setTruncated(result.truncated);setToolsEnabled(result.options?.toolsEnabled!==false);setError('')}}).catch(reason=>{if(!controller.signal.aborted)setError(String(reason?.message||reason))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  },[api,sessionId])
  useEffect(()=>{clear();setItems([]);load();const unsubscribe=api.subscribe(sessionId,load,()=>{executionAbort.current?.abort();setExecuting(false);setCode('');setResult('');clear();setItems([]);load()});return()=>{request.current?.abort();unsubscribe()}},[api,sessionId,load,clear])
  useEffect(()=>()=>executionAbort.current?.abort(),[sessionId])
  useEffect(()=>{
    if(!selected)return
    let active=true,owned='';setText('');setUrl('');setOpening(true);setEditing(false);imageBudget.current=0
    void api.read(sessionId,selected).then(({bytes})=>{
      if(!active)return
      if(isTextResource(selected)){if(bytes.length>MAX_RESOURCE_PREVIEW_BYTES)throw Error('File is too large for text preview');setText(new TextDecoder().decode(bytes))}
      else{owned=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:selected.mime}));setUrl(owned)}
    }).catch(reason=>{if(active)setError(String(reason?.message||reason))}).finally(()=>active&&setOpening(false))
    const back=registerBackSurface('session-resource:'+sessionId,clear)
    return()=>{active=false;if(owned)URL.revokeObjectURL(owned);back()}
  },[api,sessionId,selected,clear])
  const run=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await work();load()}catch(reason){setError(String((reason as Error)?.message||reason))}finally{setBusy(false)}}
  const resolveImage=useCallback(async(path:string)=>{
    const item=items.find(item=>item.path===path)
    if(!item||!item.mime.startsWith('image/')||imageBudget.current>=20*1024*1024)return
    const {bytes}=await api.read(sessionId,item);if(bytes.length>2*1024*1024||imageBudget.current+bytes.length>20*1024*1024)return
    imageBudget.current+=bytes.length
    return URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:item.mime}))
  },[api,sessionId,items])
  const openPath=(path:string)=>{const item=items.find(item=>item.path===path);if(item){setError('');setSelected(item)}else setError('Session file not found')}
  const upload=(file:File|null)=>{if(!file)return;void run(async()=>{if(file.size>10*1024*1024)throw Error('Session files must not exceed 10 MB');await api.create(sessionId,'input/'+crypto.randomUUID().slice(0,8)+'-'+file.name.replace(/[\\/:*?"<>|%\u0000-\u001f]/g,'_'),new Uint8Array(await file.arrayBuffer()),file.type||resourceMime(file.name))})}
  const renderTree=(tree:ResourceTree):React.ReactNode=><>{tree.folders.map(folder=><details key={folder.path} open style={{paddingLeft:8}}><summary style={{padding:'8px 0',cursor:'pointer',overflowWrap:'anywhere'}}><IconFolder size={16} style={{verticalAlign:'middle',marginRight:6}}/>{folder.name}</summary>{renderTree(folder)}</details>)}{tree.files.map(item=><Group key={item.id} wrap="nowrap" gap="xs" style={{borderBottom:'1px solid var(--chatbox-border-primary)',minWidth:0}}>
    <button type="button" disabled={busy||editing} onClick={()=>{setError('');setSelected(item)}} style={{display:'flex',gap:8,alignItems:'center',padding:'12px 4px',flex:1,minWidth:0,textAlign:'left',border:0,background:'transparent',color:'inherit',cursor:'pointer'}}><IconFile size={18} style={{flexShrink:0}}/><span style={{overflowWrap:'anywhere',minWidth:0}}>{item.name}{item.deliverable&&<Badge size="xs" variant="light" ml={5}>{ft('Deliverable')}</Badge>}<Text size="xs" c="dimmed">{item.bytes===undefined?item.mime:(item.bytes/1024).toFixed(1)+' KB'}</Text></span></button>
    <ActionIcon size="lg" variant="subtle" color="red" aria-label={ft('Delete resource')+': '+item.name} disabled={busy||item.readOnly} onClick={()=>setDeleting(item)}><IconTrash size={18}/></ActionIcon>
  </Group>)}</>
  return <Stack gap="sm" h="100%" style={{minHeight:0,minWidth:0}}>
    <Group justify="space-between" gap="xs" wrap="wrap"><Text fw={600}>{ft('Files and resources')}</Text><Group gap={4}>
      <ActionIcon size="lg" variant="subtle" aria-label={ft('Refresh resources')} onClick={load}><IconRefresh size={18}/></ActionIcon>
      <ActionIcon size="lg" variant="subtle" aria-label={ft('New session file')} onClick={()=>setCreating(true)}><IconFilePlus size={18}/></ActionIcon>
      <FileButton onChange={upload}>{props=><ActionIcon {...props} size="lg" variant="subtle" aria-label={ft('Import session file')}><IconUpload size={18}/></ActionIcon>}</FileButton>
    </Group></Group>
    {error&&<Alert color="red" role="alert" style={{overflowWrap:'anywhere'}}>{ft(error)}</Alert>}
    <details><summary>{ft('Workspace settings')}</summary><Checkbox mt="xs" checked={toolsEnabled} label={ft('Allow the agent to manage session files and run isolated code')} onChange={event=>{const enabled=event.currentTarget.checked;void run(()=>api.configure(sessionId,enabled))}}/></details>
    {selected?<>
      <Group wrap="wrap" gap="xs"><Button variant="subtle" leftSection={<IconArrowLeft size={16}/>} onClick={clear}>{ft('All session files')}</Button><Text size="sm" style={{overflowWrap:'anywhere',flex:1}}>{selected.path}</Text></Group>
      <Group gap="xs" wrap="wrap">
        <Button size="xs" variant="light" leftSection={<IconDownload size={14}/>} loading={busy} onClick={()=>void run(()=>api.export(sessionId,selected))}>{ft('Export')}</Button>
        {isTextResource(selected)&&!selected.readOnly&&(selected.origin==='file'||selected.origin==='workspace')&&<Button size="xs" variant="light" disabled={opening||busy} onClick={()=>{setDraft(text);setEditing(!editing)}}>{editing?ft('Cancel editing'):ft('Edit file')}</Button>}
        <Button size="xs" variant="light" disabled={busy||opening} onClick={()=>void run(async()=>{await api.deliver(sessionId,selected);clear()})}>{selected.origin==='file'&&selected.deliverable?ft('Keep as working file'):ft('Save to deliverables')}</Button>
        {/\.m?js$/i.test(selected.name)&&<Button size="xs" variant="light" disabled={busy||opening||!toolsEnabled} onClick={()=>{setCode(text);setResult('');setInputPaths([]);setExecuting(true)}}>{ft('Run JavaScript')}</Button>}
        <ActionIcon size="lg" variant="subtle" color="red" aria-label={ft('Delete resource')} disabled={selected.readOnly} onClick={()=>setDeleting(selected)}><IconTrash size={17}/></ActionIcon>
      </Group>
      {opening?<Loader size="sm"/>:<div style={{flex:1,minHeight:0,overflow:'auto',overscrollBehavior:'contain',touchAction:'pan-y',paddingBottom:16}}>
        {editing?<Stack><Textarea label={ft('File content')} value={draft} onChange={event=>setDraft(event.currentTarget.value)} minRows={15} autosize maxRows={30} styles={{input:{fontFamily:'monospace'}}}/><Button loading={busy} onClick={()=>void run(async()=>{await api.save(sessionId,selected,draft);setText(draft);setEditing(false)})}>{ft('Save file')}</Button></Stack>
        :/\.(?:md|markdown)$/i.test(selected.name)?<MarkdownFilePreview source={text} path={selected.path} resolveImage={resolveImage} openFile={openPath} openExternal={url=>void platform.openLink(url)}/>
        :selected.mime==='text/html'?<iframe title={ft('Local file preview')} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={buildWorkArtifactPreview(text)} style={{width:'100%',height:'65vh',border:0}}/>
        :isTextResource(selected)?<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',margin:0}}>{text}</pre>
        :selected.mime.startsWith('image/')&&url?<img src={url} alt={selected.name} style={{maxWidth:'100%',height:'auto'}}/>
        :selected.mime.startsWith('audio/')&&url?<audio controls src={url} style={{width:'100%'}}/>
        :selected.mime.startsWith('video/')&&url?<video controls src={url} style={{width:'100%',maxHeight:'60vh'}}/>
        :<Text c="dimmed">{ft('Export this file to open it in another app.')}</Text>}
      </div>}
    </>:<>
      <TextInput aria-label={ft('Search session files')} placeholder={ft('Search session files')} value={query} onChange={event=>setQuery(event.currentTarget.value)}/>
      <Text size="xs" c="dimmed">{ft('Working files stay in this chat. Only deliverables are added to the library.')}</Text>
      {loading&&<Loader size="sm"/>}{truncated&&<Alert color="yellow">{ft('This large session has more resources than this view can show.')}</Alert>}
      <div role="tree" aria-label={ft('Session file tree')} style={{flex:1,minHeight:0,overflow:'auto',overscrollBehavior:'contain',touchAction:'pan-y'}}>{renderTree(resourceTree(items.filter(item=>(item.path+' '+item.name).toLowerCase().includes(query.toLowerCase()))))}{!loading&&!items.length&&<Text p="md" c="dimmed">{ft('No files yet. Import a file or let Work mode create one.')}</Text>}</div>
    </>}
    <AdaptiveModal opened={creating} onClose={()=>setCreating(false)} title={ft('New session file')}><Stack><TextInput label={ft('File path')} placeholder="notes/report.md" value={newPath} onChange={event=>setNewPath(event.currentTarget.value)}/><Button loading={busy} onClick={()=>void run(async()=>{const path=sessionFilePath(newPath);if(items.some(item=>item.path===path))throw Error('A file already exists at this path');await api.create(sessionId,path,new TextEncoder().encode(/\.md$/i.test(path)?'# '+path.split('/').pop()?.replace(/\.md$/i,'')+'\n':''));setCreating(false);setSelected(undefined)})}>{ft('Create file')}</Button></Stack></AdaptiveModal>
    <AdaptiveModal opened={!!deleting} onClose={()=>setDeleting(undefined)} title={ft('Delete resource')}><Stack><Text style={{overflowWrap:'anywhere'}}>{deleting?.name}</Text><Text>{ft('Delete this local resource? Its preview in chat and its library entry may stop being available. Other files are kept.')}</Text><Group justify="end"><Button variant="default" onClick={()=>setDeleting(undefined)}>{ft('Cancel')}</Button><Button color="red" loading={busy} onClick={()=>void run(async()=>{await api.remove(sessionId,deleting!);if(selected?.id===deleting?.id)clear();setDeleting(undefined)})}>{ft('Delete')}</Button></Group></Stack></AdaptiveModal>
    <AdaptiveModal opened={executing} onClose={()=>{executionAbort.current?.abort();setExecuting(false)}} title={ft('Run JavaScript')} size="lg"><Stack>
      <Text size="sm">{ft('Code runs locally with only the selected files. No network, app data, API keys or operating system commands are available. Successful file changes appear in this workspace.')}</Text>
      <MultiSelect label={ft('Files available to the script')} data={items.filter(item=>item.origin==='file').map(item=>({value:item.path,label:item.path}))} value={inputPaths} onChange={setInputPaths} searchable/>
      <Textarea label={ft('JavaScript code')} value={code} onChange={event=>setCode(event.currentTarget.value)} minRows={8} autosize maxRows={20} styles={{input:{fontFamily:'monospace'}}}/>
      <Group><Button loading={busy} onClick={()=>void run(async()=>{const controller=new AbortController();executionAbort.current=controller;const output=await api.execute(sessionId,code,inputPaths,controller.signal);setResult(JSON.stringify(output,null,2))})}>{ft('Run code')}</Button>{busy&&<Button variant="default" onClick={()=>executionAbort.current?.abort()}>{ft('Stop')}</Button>}</Group>
      {result&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'35dvh',overflow:'auto'}}>{result}</pre>}
    </Stack></AdaptiveModal>
  </Stack>
}
