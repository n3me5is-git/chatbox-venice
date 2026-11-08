import { ActionIcon, Alert, Badge, Button, Checkbox, FileButton, FileInput, Group, Loader, MultiSelect, PasswordInput, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { IconArrowLeft, IconDownload, IconFile, IconFilePlus, IconFolder, IconRefresh, IconTrash, IconUpload } from '@tabler/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_RESOURCE_PREVIEW_BYTES, isTextResource, resourceMime, resourceTree, sessionFilePath, type ResourceTree, type SessionResource } from '@shared/session-resources'
import { PreviewImages } from '@shared/preview-images'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { buildWorkArtifactPreview } from '@shared/mobile-work/artifact-preview'
import { registerBackSurface } from '@/packages/overlay-back'
import { sessionResourceAPI } from '@/packages/session-resources/api'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { MarkdownFilePreview } from './MarkdownFilePreview'
import { PythonSettings } from './PythonSettings'
import { LocalMCPSettings } from './LocalMCPSettings'
import { LocalMediaViewer } from './LocalMediaViewer'

type API=typeof sessionResourceAPI
export function SessionResources({sessionId,api=sessionResourceAPI}:{sessionId:string;api?:API}){
  useTranslation()
  const [items,setItems]=useState<SessionResource[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[truncated,setTruncated]=useState(false)
  const [selected,setSelected]=useState<SessionResource>(),[text,setText]=useState(''),[url,setUrl]=useState(''),[opening,setOpening]=useState(false),[editing,setEditing]=useState(false),[draft,setDraft]=useState('')
  const [busy,setBusy]=useState(false),[deleting,setDeleting]=useState<SessionResource>(),[creating,setCreating]=useState(false),[newPath,setNewPath]=useState('notes.md')
  const [readable,setReadable]=useState(false)
  const [toolsEnabled,setToolsEnabled]=useState(true),[executing,setExecuting]=useState(false),[code,setCode]=useState(''),[inputPaths,setInputPaths]=useState<string[]>([]),[result,setResult]=useState('')
  const executionAbort=useRef<AbortController>()
  const [pythonEnabled,setPythonEnabled]=useState(false),[pythonReady,setPythonReady]=useState(false),[codeLanguage,setCodeLanguage]=useState<'javascript'|'python'>('javascript')
  const [backup,setBackup]=useState<'export'|'import'>(),[password,setPassword]=useState(''),[repeated,setRepeated]=useState(''),[archive,setArchive]=useState<File|null>(null)
  const request=useRef<AbortController>()
  const previewImages=useMemo(()=>new PreviewImages(async item=>(await api.read(sessionId,item)).bytes),[api,sessionId,selected?.id,items])
  useEffect(()=>{previewImages.activate();return()=>previewImages.close()},[previewImages])
  const clear=useCallback(()=>{setSelected(undefined);setText('');setDraft('');setEditing(false);setUrl('')},[])
  const load=useCallback(()=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true)
    void api.list(sessionId,controller.signal).then(result=>{if(!controller.signal.aborted){setItems(result.items);setTruncated(result.truncated);setToolsEnabled(result.options?.toolsEnabled!==false);setPythonEnabled(!!result.options?.pythonEnabled);setError('')}}).catch(reason=>{if(!controller.signal.aborted)setError(String(reason?.message||reason))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  },[api,sessionId])
  useEffect(()=>{clear();setItems([]);load();const unsubscribe=api.subscribe(sessionId,load,()=>{executionAbort.current?.abort();setExecuting(false);setCode('');setResult('');clear();setItems([]);load()});return()=>{request.current?.abort();unsubscribe()}},[api,sessionId,load,clear])
  useEffect(()=>()=>executionAbort.current?.abort(),[sessionId])
  useEffect(()=>{
    if(!selected)return
    let active=true,owned='';setText('');setUrl('');setOpening(true);setReadable(false);setEditing(false)
    void api.read(sessionId,selected).then(({bytes})=>{
      if(!active)return
      if(isTextResource(selected)){if(bytes.length>MAX_RESOURCE_PREVIEW_BYTES)throw Error('File is too large for text preview');setText(new TextDecoder().decode(bytes))}
      else{owned=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:selected.mime}));setUrl(owned)}
      setReadable(true)
    }).catch(reason=>{if(active)setError(String(reason?.message||reason))}).finally(()=>active&&setOpening(false))
    const back=registerBackSurface('session-resource:'+sessionId,clear)
    return()=>{active=false;if(owned)URL.revokeObjectURL(owned);back()}
  },[api,sessionId,selected,clear])
  const run=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await work();load()}catch(reason){setError(String((reason as Error)?.message||reason))}finally{setBusy(false)}}
  const resolveImage=useCallback(async(path:string)=>{
    const item=items.find(item=>item.path===path)
    if(!item)return
    const blob=await previewImages.load(item)
    return blob?URL.createObjectURL(blob):undefined
  },[previewImages,items])
  const openPath=(path:string)=>{const item=items.find(item=>item.path===path);if(item){setError('');setSelected(item)}else setError('Session file not found')}
  const upload=(file:File|null)=>{if(!file)return;void run(async()=>{if(file.size>10*1024*1024)throw Error('Session files must not exceed 10 MB');const name=file.name.replace(/[\\/:*?"<>|%\u0000-\u001f]/g,'_');const path='input/'+(items.some(item=>item.path==='input/'+name)?crypto.randomUUID().slice(0,8)+'-':'')+name;await api.create(sessionId,path,new Uint8Array(await file.arrayBuffer()),file.type||resourceMime(file.name))})}
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
    <details><summary>{ft('Workspace settings')}</summary><Stack mt="xs" gap="xs"><Checkbox checked={toolsEnabled} label={ft('Allow the agent to manage session files and run isolated code')} onChange={event=>{const enabled=event.currentTarget.checked;void run(()=>api.configure(sessionId,enabled))}}/><Group gap="xs"><Button size="xs" variant="default" onClick={()=>{setPassword('');setRepeated('');setBackup('export')}}>{ft('Back up workspace files')}</Button><Button size="xs" variant="default" onClick={()=>{setPassword('');setArchive(null);setBackup('import')}}>{ft('Restore workspace files')}</Button></Group><PythonSettings sessionId={sessionId} enabled={pythonEnabled} onReady={setPythonReady} api={api} onChanged={load}/><LocalMCPSettings sessionId={sessionId}/></Stack></details>
    {selected?<>
      <Group wrap="wrap" gap="xs"><Button variant="subtle" leftSection={<IconArrowLeft size={16}/>} onClick={clear}>{ft('All session files')}</Button><Text size="sm" style={{overflowWrap:'anywhere',flex:1}}>{selected.path}</Text></Group>
      <Group gap="xs" wrap="wrap">
        <Button size="xs" variant="light" leftSection={<IconDownload size={14}/>} loading={busy} onClick={()=>void run(()=>api.export(sessionId,selected))}>{ft('Export')}</Button>
        {isTextResource(selected)&&<Button size="xs" variant="light" disabled={opening||busy||!readable} onClick={()=>{setDraft(text);setEditing(!editing)}}>{editing?ft('Cancel editing'):ft(!selected.readOnly&&(selected.origin==='file'||selected.origin==='workspace')?'Edit file':'Edit a copy')}</Button>}
        <Button size="xs" variant="light" disabled={busy||opening} onClick={()=>void run(async()=>{await api.deliver(sessionId,selected);clear()})}>{selected.origin==='file'&&selected.deliverable?ft('Keep as working file'):ft('Save to deliverables')}</Button>
        {/\.(?:m?js|py)$/i.test(selected.name)&&<Button size="xs" variant="light" disabled={busy||opening||!toolsEnabled||selected.name.endsWith('.py')&&(!pythonEnabled||!pythonReady)} onClick={()=>{setCodeLanguage(selected.name.endsWith('.py')?'python':'javascript');setCode(text);setResult('');setInputPaths([]);setExecuting(true)}}>{selected.name.endsWith('.py')?ft('Run Python'):ft('Run JavaScript')}</Button>}
        <ActionIcon size="lg" variant="subtle" color="red" aria-label={ft('Delete resource')} disabled={selected.readOnly} onClick={()=>setDeleting(selected)}><IconTrash size={17}/></ActionIcon>
      </Group>
      {opening?<Loader size="sm"/>:<div style={{flex:1,minHeight:0,overflow:'auto',overscrollBehavior:'contain',touchAction:'pan-y',paddingBottom:16}}>
        {editing?<Stack><Textarea label={ft('File content')} value={draft} onChange={event=>setDraft(event.currentTarget.value)} minRows={15} autosize maxRows={30} styles={{input:{fontFamily:'monospace'}}}/><Button loading={busy} onClick={()=>void run(async()=>{if(!selected.readOnly&&(selected.origin==='file'||selected.origin==='workspace'))await api.save(sessionId,selected,draft);else{const created=await api.create(sessionId,'edits/'+crypto.randomUUID().slice(0,8)+'-'+selected.name.replace(/[\\/:*?"<>|%\u0000-\u001f]/g,'_'),new TextEncoder().encode(draft),selected.mime);setSelected(created)}setText(draft);setEditing(false)})}>{ft(!selected.readOnly&&(selected.origin==='file'||selected.origin==='workspace')?'Save file':'Save editable copy')}</Button></Stack>
        :/\.(?:md|markdown)$/i.test(selected.name)&&readable?<MarkdownFilePreview source={text} path={selected.path} resolveImage={resolveImage} openFile={openPath} openExternal={url=>void platform.openLink(url)}/>
        :selected.mime==='text/html'?<iframe title={ft('Local file preview')} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={buildWorkArtifactPreview(text)} style={{width:'100%',height:'65vh',border:0}}/>
        :isTextResource(selected)?<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',margin:0}}>{text}</pre>
        :/^(image|audio|video)\//.test(selected.mime)&&url?<LocalMediaViewer name={selected.name} mime={selected.mime} url={url}/>
        :selected.mime==='application/pdf'&&platform.isDesktopLike&&url?<iframe title={ft('Local file preview')} src={url} style={{width:'100%',height:'65vh',border:0}}/>
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
    <AdaptiveModal opened={executing} onClose={()=>{executionAbort.current?.abort();setExecuting(false)}} title={codeLanguage==='python'?ft('Run Python'):ft('Run JavaScript')} size="lg"><Stack>{error&&<Alert color="red" role="alert">{ft(error)}</Alert>}
      <Text size="sm">{ft('Code runs locally with only the selected files. No network, app data, API keys or operating system commands are available. Successful file changes appear in this workspace.')}</Text>
      <MultiSelect label={ft('Files available to the script')} data={items.filter(item=>item.origin==='file').map(item=>({value:item.path,label:item.path}))} value={inputPaths} onChange={setInputPaths} searchable/>
      <Textarea label={codeLanguage==='python'?ft('Python code'):ft('JavaScript code')} value={code} onChange={event=>setCode(event.currentTarget.value)} minRows={8} autosize maxRows={20} styles={{input:{fontFamily:'monospace'}}}/>
      <Group><Button loading={busy} onClick={()=>void run(async()=>{const controller=new AbortController();executionAbort.current=controller;const output=await (codeLanguage==='python'?api.executePython:api.execute)(sessionId,code,inputPaths,controller.signal);setResult(JSON.stringify(output,null,2))})}>{ft('Run code')}</Button>{busy&&<Button variant="default" onClick={()=>executionAbort.current?.abort()}>{ft('Stop')}</Button>}</Group>
      {result&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'35dvh',overflow:'auto'}}>{result}</pre>}
    </Stack></AdaptiveModal>
    <AdaptiveModal opened={!!backup} onClose={()=>{executionAbort.current?.abort();setPassword('');setRepeated('');setBackup(undefined)}} title={backup==='export'?ft('Back up workspace files'):ft('Restore workspace files')}><Stack>{error&&<Alert color="red" role="alert">{ft(error)}</Alert>}
      <Text size="sm">{ft('This encrypted backup includes managed working files and deliverables. Restoring adds files to this chat; existing files are kept. Chat messages and legacy workspace folders use their own backup tools.')}</Text>
      {backup==='import'&&<FileInput label={ft('Select a backup file')} value={archive} onChange={setArchive} accept=".chatboxvault"/>}
      <PasswordInput label={ft('Backup passphrase')} value={password} onChange={event=>setPassword(event.currentTarget.value)} autoComplete="new-password"/>
      {backup==='export'&&<PasswordInput label={ft('Repeat passphrase')} value={repeated} onChange={event=>setRepeated(event.currentTarget.value)} autoComplete="new-password"/>}
      <Button disabled={password.length<12||backup==='export'&&password!==repeated||backup==='import'&&!archive} loading={busy} onClick={()=>void run(async()=>{const controller=new AbortController();executionAbort.current=controller;if(backup==='export')await api.backup(sessionId,password,controller.signal);else await api.restore(sessionId,archive!,password,controller.signal);setPassword('');setRepeated('');setBackup(undefined)})}>{backup==='export'?ft('Export encrypted backup'):ft('Restore')}</Button>
    </Stack></AdaptiveModal>
  </Stack>
}
