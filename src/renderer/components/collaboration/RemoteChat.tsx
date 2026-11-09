import { useEffect,useRef,useState,useSyncExternalStore } from 'react'
import { ActionIcon,Alert,Badge,Button,Checkbox,Group,Loader,Menu,Select,Stack,Text } from '@mantine/core'
import { IconAdjustments,IconArrowUp,IconCloud,IconCopy,IconDots,IconFiles,IconLogout,IconUsers } from '@tabler/icons-react'
import { Virtuoso } from 'react-virtuoso'
import type { VirtuosoHandle } from 'react-virtuoso'
import type { SharedFile,SharedControlPatch,SharedSnapshot } from '@shared/collaboration'
import { collaboration,switchCurrentSession } from '@/packages/collaboration/runtime'
import { collaborationError } from '@/packages/collaboration/errors'
import { Drawer,useOverlayManager } from '@/components/layout/Overlay'
import { forkT as ft } from '@/i18n/fork'
import { HitlCard } from './HitlCard'
import { SharedMarkdown } from './SharedMarkdown'
import { RemoteFiles } from './RemoteFiles'
import type { GuestShare } from '@/packages/collaboration/hub'
import { RemotePromptInput } from './RemotePromptInput'

export function remoteStatus(room:GuestShare){return ft({connecting:'Connecting…',waiting:'Waiting for owner approval',connected:'Connected',disconnected:'Disconnected'}[room.status])}
const levels={default:'Default',off:'Off',minimal:'Minimal',low:'Low',medium:'Medium',high:'High',xhigh:'Extra high',max:'Maximum'}
function RemoteSettings({room,opened,onClose}:{room:GuestShare;opened:boolean;onClose:()=>void}){
  const [pending,setPending]=useState(false),[error,setError]=useState(''),controls=room.snapshot?.controls
  const disabled=pending||room.busy||room.status!=='connected'||!room.permissions.write||!room.permissions.interact
  const change=async(patch:SharedControlPatch)=>{setPending(true);setError('');try{await collaboration.configure(room.id,patch)}catch(error){setError(collaborationError(error))}finally{setPending(false)}}
  return <Drawer opened={opened} onClose={onClose} closeButtonProps={{'aria-label':ft('Close remote chat settings')}} title={ft('Remote chat settings')} position="right" size="min(440px, 100vw)" styles={{body:{overflowY:'auto',maxHeight:'calc(100dvh - 70px)',paddingBottom:'max(16px, env(safe-area-inset-bottom))'}}}><Stack>
    <Text size="sm">{ft('The host chooses the model, MCP tools and security settings. Changes below apply to the shared conversation for everyone.')}</Text>
    {!room.permissions.interact&&<Alert>{ft('Read-only access')}</Alert>}
    {!controls&&<Alert>{ft('Update the owner’s app to use remote chat controls')}</Alert>}
    {controls&&<><Text size="sm" fw={600}>{ft('Host model')}: {controls.model}</Text>
      {!!controls.thinkingOptions.length&&<Select label={ft('Thinking Effort')} value={controls.thinking} data={controls.thinkingOptions.map(value=>({value,label:ft(levels[value])}))} allowDeselect={false} comboboxProps={{withinPortal:false}} disabled={disabled} onChange={value=>{if(value)void change({thinking:value as typeof controls.thinking})}}/>}
      <Checkbox label={ft('Chatbox web search')} checked={controls.webBrowsing} disabled={disabled} onChange={event=>void change({webBrowsing:event.currentTarget.checked})}/>
      {controls.venice&&<Stack gap="sm"><Text fw={600}>{ft('Venice model search')}</Text><Checkbox label={ft('Enable Venice search')} disabled={disabled||controls.venice.webSearch==='off'} checked={controls.venice.webSearchEnabled&&controls.venice.webSearch!=='off'} onChange={event=>void change({venice:{webSearchEnabled:event.currentTarget.checked}})}/>
        <Select label={ft('Search mode')} value={controls.venice.webSearch} data={[['off','Do not search'],['auto','When needed'],['on','For every message']].map(([value,label])=>({value,label:ft(label)}))} disabled={disabled} allowDeselect={false} comboboxProps={{withinPortal:false}} onChange={value=>{if(value)void change({venice:{webSearch:value as 'off'|'auto'|'on'}})}}/>
        <Select label={ft('Search engine')} value={controls.venice.searchProvider} data={[{value:'native',label:'Venice'},{value:'brave',label:'Brave'},{value:'google',label:'Google'},{value:'exa',label:'Exa'}]} disabled={disabled||controls.venice.searchToolMode==='separate'} allowDeselect={false} comboboxProps={{withinPortal:false}} onChange={value=>{if(value)void change({venice:{searchProvider:value as 'native'|'brave'|'google'|'exa'}})}}/>
        <Checkbox label={ft('Expose search engines as separate tools')} checked={controls.venice.searchToolMode==='separate'} disabled={disabled} onChange={event=>void change({venice:{searchToolMode:event.currentTarget.checked?'separate':'selected'}})}/>
        <Checkbox label={ft('Include citations')} checked={controls.venice.webCitations} disabled={disabled} onChange={event=>void change({venice:{webCitations:event.currentTarget.checked}})}/>
        <Checkbox label={ft('Read web pages')} checked={controls.venice.webScraping} disabled={disabled} onChange={event=>void change({venice:{webScraping:event.currentTarget.checked}})}/>
        <Checkbox label={ft('Search X')} checked={controls.venice.xSearch} disabled={disabled} onChange={event=>void change({venice:{xSearch:event.currentTarget.checked}})}/>
      </Stack>}
      {controls.subscriptionWebSearch!==undefined&&<Checkbox label={ft('ChatGPT native web search')} checked={controls.subscriptionWebSearch} disabled={disabled} onChange={event=>void change({subscriptionWebSearch:event.currentTarget.checked})}/>}</>}
    {pending&&<Loader size="sm"/>}{error&&<Alert color="red" role="alert">{ft(error)}</Alert>}
    {!!room.snapshot?.mentions?.length&&<Stack gap={4}><Text fw={600}>{ft('Host agents and tools')}</Text>{room.snapshot.mentions.map(item=><Text size="xs" key={item.kind+item.id}>@{item.name}{item.description?' · '+item.description:''}</Text>)}</Stack>}
  </Stack></Drawer>
}
function RemoteMessage({message,files,open}:{message:SharedSnapshot['messages'][number];files:SharedFile[];open:(file:SharedFile)=>void}){
  return <article data-remote-message={message.id} style={{maxWidth:880,margin:'0 auto',padding:'16px',minWidth:0}}>
    <Stack gap="xs" style={message.role==='user'?{marginInlineStart:'min(36px, 5vw)',padding:12,borderRadius:12,background:'var(--mantine-color-default-hover)'}:undefined}>
      <Text size="xs" fw={600} c="dimmed" title={message.author?.id}>{message.author?`${message.author.id==='owner'?ft('Owner'):message.author.name} · ${message.author.id.slice(0,8)}`:ft(message.role==='assistant'?'Assistant':'System')}</Text>
      {message.reasoning&&<details><summary>{ft('Thinking')}</summary><SharedMarkdown text={message.reasoning}/></details>}
      {message.tools?.map(tool=><details key={tool.id}><summary style={{overflowWrap:'anywhere'}}>{tool.state==='running'?'◌':tool.state==='failed'?'⚠':'✓'} {tool.name} · {ft({running:'Running',completed:'Completed',failed:'Failed'}[tool.state])}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:240,overflowY:'auto'}}>{tool.detail}</pre></details>)}
      <SharedMarkdown text={message.text} files={files} openFile={open}/>
      {message.files?.map(id=>{const file=files.find(file=>file.id===id);return file&&<Button key={id} variant="light" size="compact-sm" justify="start" onClick={()=>open(file)} styles={{label:{whiteSpace:'normal',overflowWrap:'anywhere'}}}>{file.name}</Button>})}
      {message.error&&<Alert color="red" role="alert">{message.error}</Alert>}
      {message.generating&&<Text size="xs" c="dimmed">{ft('The host is working…')}</Text>}
    </Stack>
  </article>
}
/** A full-page, volatile transcript. It never invokes the guest's providers or local tools. */
export function RemoteChat({roomId,onManage,onLeave}:{roomId:string;onManage:()=>void;onLeave:()=>void}){
  useSyncExternalStore(collaboration.subscribe,collaboration.getVersion)
  const room=collaboration.guests.get(roomId),[draft,setDraft]=useState(room?.draft||''),[interact,setInteract]=useState(room?.permissions.interact??false),[sending,setSending]=useState(false),[cloning,setCloning]=useState(false),[error,setError]=useState(''),[settings,setSettings]=useState(false),[files,setFiles]=useState(false),[selected,setSelected]=useState<SharedFile>(),[atBottom,setAtBottom]=useState(true),list=useRef<VirtuosoHandle>(null),task=useRef<AbortController>()
  const [actions,setActions]=useState(false)
  useOverlayManager(actions,()=>setActions(false))
  useEffect(()=>()=>task.current?.abort(),[])
  useEffect(()=>{if(room)setInteract(room.permissions.interact)},[room?.permissions.interact])
  useEffect(()=>{if(!room){setDraft('');setFiles(false);setSettings(false);task.current?.abort()}},[!!room])
  if(!room)return <Stack p="md"><Alert>{ft('This shared chat has ended. No local copy was created.')}</Alert><Button variant="default" onClick={onLeave}>{ft('Close remote chat')}</Button></Stack>
  const messages=room.snapshot?.messages.filter(message=>!message.archived)||[],sharedFiles=room.snapshot?.files||[],connected=room.status==='connected'
  const open=(file:SharedFile)=>{setSelected(file);setFiles(true)}
  const submit=async()=>{if(sending||room.busy||!draft.trim()||!connected||!room.permissions.write)return;setSending(true);setError('');const value=draft;try{await collaboration.post(room.id,value,interact&&room.permissions.interact);if(room.draft===value){room.draft='';setDraft('')}}catch(error){setError(collaborationError(error))}finally{setSending(false)}}
  const clone=async()=>{setCloning(true);setError('');const controller=new AbortController();task.current=controller;try{const id=await collaboration.clone(room.id,controller.signal);switchCurrentSession(id)}catch(error){if(!controller.signal.aborted)setError(collaborationError(error))}finally{setCloning(false)}}
  return <div data-testid="remote-chat" style={{display:'flex',flexDirection:'column',height:'100%',minHeight:0,minWidth:0}}>
    <Group justify="space-between" gap="xs" p="sm" wrap="nowrap" style={{flexShrink:0,borderBottom:'1px solid var(--mantine-color-default-border)'}}>
      <Stack gap={2} style={{minWidth:0}}><Group gap={6} wrap="nowrap"><IconCloud size={18}/><Text fw={600} truncate>{room.snapshot?.title||ft('Remote chat')}</Text></Group><Text size="xs" c="dimmed" truncate>{ft('Host model')}: {room.snapshot?.controls?.model||'—'}</Text></Stack>
      <Group gap={2} wrap="nowrap"><Badge size="xs" color={connected?'green':'gray'}>{remoteStatus(room)}</Badge><ActionIcon size="lg" variant="subtle" aria-label={ft('Shared files')} onClick={()=>{setSelected(undefined);setFiles(true)}}><IconFiles size={20}/></ActionIcon><ActionIcon size="lg" variant="subtle" aria-label={ft('Remote chat settings')} onClick={()=>setSettings(true)}><IconAdjustments size={20}/></ActionIcon>
        <Menu opened={actions} onChange={setActions} withinPortal={false} position="bottom-end"><Menu.Target><ActionIcon size="lg" variant="subtle" aria-label={ft('Remote chat actions')}><IconDots size={20}/></ActionIcon></Menu.Target><Menu.Dropdown><Menu.Item leftSection={<IconUsers size={16}/>} onClick={onManage}>{ft('Manage connection')}</Menu.Item>{room.permissions.clone&&<Menu.Item leftSection={<IconCopy size={16}/>} disabled={cloning||room.busy||!connected||room.snapshot?.truncated} onClick={()=>void clone()}>{ft('Clone chat and all files')}</Menu.Item>}<Menu.Item color="red" leftSection={<IconLogout size={16}/>} onClick={()=>{collaboration.stop(room.id);onLeave()}}>{ft('Leave shared chat')}</Menu.Item></Menu.Dropdown></Menu>
      </Group>
    </Group>
    {!connected&&<Alert m="sm">{remoteStatus(room)}. {ft(room.status==='waiting'?'The owner must approve your participant ID before any conversation is shared.':'Keep the owner’s app open. Use Manage connection to reconnect.')}</Alert>}
    {room.snapshot?.truncated&&<Alert color="yellow" m="sm">{ft('The conversation is changing or exceeds the sharing limit. Cloning is unavailable until a complete snapshot can be shared.')}</Alert>}
    <div style={{flex:'1 1 0',minHeight:100,position:'relative'}}>
      <Virtuoso ref={list} data={messages} computeItemKey={(_index,message)=>message.id} initialTopMostItemIndex={Math.max(0,messages.length-1)} followOutput={atBottom?'auto':false} atBottomStateChange={setAtBottom} itemContent={(_index,message)=><RemoteMessage message={message} files={sharedFiles} open={open}/>} style={{height:'100%',overscrollBehavior:'contain'}}/>
      {!atBottom&&<Button size="compact-sm" variant="default" style={{position:'absolute',bottom:12,right:16}} onClick={()=>list.current?.scrollToIndex({index:messages.length-1,align:'end',behavior:'smooth'})}>{ft('Latest messages')}</Button>}
    </div>
    <Stack gap="xs" p="sm" style={{flexShrink:0,width:'100%',maxWidth:920,margin:'0 auto',paddingBottom:'max(12px, env(safe-area-inset-bottom))'}}>
      {!!room.hitls.length&&<Stack gap="xs" style={{maxHeight:'38dvh',overflowY:'auto'}}>{room.hitls.map(request=><HitlCard key={request.id} request={request} answer={value=>collaboration.answer(room.id,request.id,value)}/>)}</Stack>}
      {(error||room.error)&&<Alert color="red" role="alert">{ft(error||room.error||'')}</Alert>}
      {cloning&&<Group><Loader size="sm"/><Text size="sm">{ft('Cloning shared chat…')}</Text><Button variant="subtle" onClick={()=>task.current?.abort()}>{ft('Cancel import')}</Button></Group>}
      {room.busy&&<Group gap="xs" aria-live="polite"><Loader size="xs"/><Text size="xs" c="dimmed">{ft('The host is working…')}</Text></Group>}
      {room.permissions.write?<div style={{border:'1px solid var(--mantine-color-default-border)',borderRadius:12,padding:8}}>
        <RemotePromptInput room={room} value={draft} change={value=>{room.draft=value;setDraft(value)}} submit={()=>void submit()}/>
        <Group justify="space-between" gap="xs" mt="xs">{room.permissions.interact?<Checkbox label={ft('Ask the AI to reply (uses the owner’s account)')} checked={interact} onChange={event=>setInteract(event.currentTarget.checked)} styles={{label:{fontSize:12}}}/>:<Text size="xs" c="dimmed">{ft('Messages only')}</Text>}<Button size="compact-sm" leftSection={<IconArrowUp size={16}/>} loading={sending} disabled={!connected||room.busy||!draft.trim()} onClick={()=>void submit()}>{ft(interact?'Send to AI':'Send message')}</Button></Group>
      </div>:<Text ta="center" size="sm" c="dimmed">{ft('Read-only access')}</Text>}
    </Stack>
    <RemoteSettings room={room} opened={settings} onClose={()=>setSettings(false)}/><RemoteFiles room={room} opened={files} initial={selected} onClose={()=>setFiles(false)}/>
  </div>
}
