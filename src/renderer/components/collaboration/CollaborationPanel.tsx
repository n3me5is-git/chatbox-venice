import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { ActionIcon,Alert,Badge,Button,Card,Checkbox,Divider,FileButton,Group,Image,Radio,ScrollArea,Select,Stack,Text,Textarea,TextInput } from '@mantine/core'
import { IconCopy,IconQrcode,IconRefresh,IconTrash } from '@tabler/icons-react'
import { useEffect,useRef,useState,useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { HitlPolicy,SharedFile,SharePermissions } from '@shared/collaboration'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { collaboration,initializeCollaboration,switchCurrentSession } from '@/packages/collaboration/runtime'
import type { GuestShare,HostShare } from '@/packages/collaboration/hub'
import { deviceIdentity,qrSvg,scanQR } from '@/packages/collaboration/transport'
import { fingerprint } from '@/packages/collaboration/crypto'
import { copyToClipboard } from '@/packages/navigator'
import platform from '@/platform'
import { forkT as ft } from '@/i18n/fork'
import { HitlCard } from './HitlCard'

function SharedMarkdown({text}:{text:string}){return <ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex]} skipHtml components={{img:()=>null,a:({href,children})=><a href={href} onClick={event=>{event.preventDefault();if(href&&/^https?:\/\//.test(href))void platform.openLink(href)}}>{children}</a>}}>{text}</ReactMarkdown>}
function Permissions({value,change}:{value:SharePermissions;change:(value:SharePermissions)=>void}){return <Group gap="sm"><Checkbox label={ft('Write messages')} checked={value.write} onChange={event=>change({...value,write:event.currentTarget.checked,interact:event.currentTarget.checked&&value.interact})}/><Checkbox label={ft('Use AI and tools')} checked={value.interact} disabled={!value.write} onChange={event=>change({...value,interact:event.currentTarget.checked})}/><Checkbox label={ft('Clone chat and files')} checked={value.clone} onChange={event=>change({...value,clone:event.currentTarget.checked})}/></Group>}
function HostView({room}:{room:HostShare}){
  const [showCode,setShowCode]=useState(false)
  return <Stack><Group justify="space-between"><Text fw={600}>{room.title}</Text><Badge color="green">{ft('Sharing is active')}</Badge></Group>
    <Text size="xs" c="dimmed">{ft('Session ID')}: {room.id.slice(0,12)}</Text>
    <Alert color="blue">{ft('Sharing includes the conversation and its accessible files. The owner’s device runs AI and tools using its configured providers. Keep this device open. Sharing stops when the app closes or locks.')}</Alert>
    <Radio.Group label={ft('Who can answer agent questions and approvals?')} value={room.policy} onChange={value=>collaboration.setPolicy(room.id,value as HitlPolicy)}><Stack gap="xs" mt="xs">
      <Radio value="owner" label={ft('Session owner only')}/><Radio value="first" label={ft('Everyone: the first valid answer wins')}/><Radio value="requester" label={ft('Only the person who sent the request')}/>
    </Stack></Radio.Group>
    <Text size="xs" c="dimmed">{ft('Changing this setting cancels pending decisions. Device security and access approvals always stay with the owner.')}</Text>
    <Button variant="light" leftSection={<IconQrcode size={18}/>} onClick={()=>setShowCode(!showCode)}>{ft('Pairing code and QR')}</Button>
    {showCode&&<Stack><Image src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qrSvg(room.code))} alt={ft('Pairing QR code')} w={240} maw="100%" mx="auto"/><Textarea label={ft('Pairing code')} value={room.code} readOnly autosize minRows={2} maxRows={4}/><Button variant="default" leftSection={<IconCopy size={16}/>} onClick={()=>void copyToClipboard(room.code)}>{ft('Copy pairing code')}</Button><Text size="xs">{ft('Treat this invitation like a password. New participants still need your approval.')}</Text></Stack>}
    <Text fw={600}>{ft('Participants')}</Text>
    {!room.peers.size&&<Text c="dimmed" size="sm">{ft('Waiting for someone to join…')}</Text>}
    {[...room.peers.values()].map(peer=><Card key={peer.author.id} withBorder><Stack gap="xs"><Group justify="space-between"><Text fw={500}>{peer.author.name}</Text><Badge>{ft(peer.approved?'Admitted':'Waiting for approval')}</Badge></Group><Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{peer.author.id}</Text>
      <Permissions value={peer.permissions} change={permissions=>{if(peer.approved)collaboration.setPermissions(room.id,peer.author.id,permissions);else{peer.permissions=permissions;collaboration.changed()}}}/>
      <Group>{!peer.approved&&<Button onClick={()=>void collaboration.admit(room.id,peer.author.id,true)}>{ft('Admit participant')}</Button>}<Button color="red" variant="subtle" onClick={()=>collaboration.revoke(room.id,peer.author.id)}>{ft('Revoke access')}</Button></Group>
    </Stack></Card>)}
    {room.hitl.requests('owner').map(request=><HitlCard key={request.id} request={request} answer={async value=>{if(!room.hitl.accept(request.id,'owner',value))throw Error('This question is no longer available')}}/>)}
    {room.error&&<Alert color="red">{ft(room.error)}</Alert>}
    <Button color="red" variant="light" leftSection={<IconTrash size={16}/>} onClick={()=>collaboration.stop(room.id)}>{ft('Stop sharing')}</Button>
  </Stack>
}
function GuestView({room}:{room:GuestShare}){
  const [draft,setDraft]=useState(''),[interact,setInteract]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<{file:SharedFile;url?:string;text?:string}>(),[cloning,setCloning]=useState(false),controller=useRef<AbortController>(),previewController=useRef<AbortController>()
  useEffect(()=>()=>{controller.current?.abort();previewController.current?.abort()},[])
  useEffect(()=>()=>{if(preview?.url)URL.revokeObjectURL(preview.url)},[preview?.url])
  useEffect(()=>{if(!room.permissions.interact)setInteract(false)},[room.permissions.interact])
  const openFile=async(file:SharedFile)=>{previewController.current?.abort();const abort=new AbortController();previewController.current=abort;setError('');setPreview(undefined)
    try{if((file.bytes??0)>12*1024*1024)throw Error('Preview is limited to 12 MB. Clone this chat to open larger files locally.');const chunks:Uint8Array<ArrayBuffer>[]= [];let length=0
      for await(const bytes of collaboration.readFile(room.id,file.id,false,abort.signal)){length+=bytes.length;if(length>12*1024*1024)throw Error('Preview is limited to 12 MB. Clone this chat to open larger files locally.');chunks.push(bytes.slice())}
      const blob=new Blob(chunks,{type:file.mime});for(const bytes of chunks)bytes.fill(0);if(abort.signal.aborted)return
      if(file.mime.startsWith('text/')||/\.(md|json|js|py|csv)$/i.test(file.name))setPreview({file,text:(await blob.text()).slice(0,2*1024*1024)})
      else if(/^(image|audio|video)\//.test(file.mime))setPreview({file,url:URL.createObjectURL(blob)})
      else throw Error('Clone this chat to open this file with your device.')
    }catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:String(error))}}
  const submit=async()=>{if(busy||!draft.trim())return;setBusy(true);setError('');try{await collaboration.post(room.id,draft,interact);setDraft('')}catch(error){setError(error instanceof Error?error.message:String(error))}finally{setBusy(false)}}
  const clone=async()=>{setCloning(true);setError('');const abort=new AbortController();controller.current=abort;try{const id=await collaboration.clone(room.id,abort.signal);switchCurrentSession(id)}catch(error){setError(error instanceof Error?error.message:String(error))}finally{setCloning(false)}}
  return <Stack><Group justify="space-between"><Text fw={600}>{room.snapshot?.title||ft('Collaborative chat')}</Text><Badge>{ft({connecting:'Connecting…',waiting:'Waiting for owner approval',connected:'Connected',disconnected:'Disconnected'}[room.status])}</Badge></Group>
    {room.status==='connecting'&&<Alert>{ft('Pairing can take a few seconds. Some networks block direct WebRTC; try another network or a reachable signaling relay.')}</Alert>}
    {room.status==='waiting'&&<Alert>{ft('The owner must approve your participant ID before any conversation is shared.')}</Alert>}
    {room.snapshot&&<><Alert color="blue">{ft('This shared view is temporary. Clone only if you want your own local copy. Shared files and model responses are untrusted content.')}</Alert>
      {room.snapshot.truncated&&<Alert color="yellow">{ft('The conversation is changing or exceeds the sharing limit. Cloning is unavailable until a complete snapshot can be shared.')}</Alert>}
      <ScrollArea.Autosize mah="42dvh" type="auto"><Stack gap="sm">{room.snapshot.messages.map(message=><Card key={message.id} withBorder padding="sm"><Text size="xs" fw={600} c="dimmed">{message.author?.name==='Owner'?ft('Owner'):message.author?.name||ft(message.role==='assistant'?'Assistant':'System')}{message.author&&' · '+message.author.id.slice(0,8)}</Text><div style={{overflowWrap:'anywhere',fontSize:14}}><SharedMarkdown text={message.text}/></div>{message.files?.map(id=>{const file=room.snapshot?.files.find(file=>file.id===id);return file&&<Button key={id} size="xs" variant="light" onClick={()=>void openFile(file)}>{file.name}</Button>})}</Card>)}</Stack></ScrollArea.Autosize>
      {room.hitls.map(request=><HitlCard key={request.id} request={request} answer={value=>collaboration.answer(room.id,request.id,value)}/>)}
      {room.permissions.write?<><Textarea label={ft('Message')} value={draft} onChange={event=>setDraft(event.currentTarget.value)} autosize minRows={2} maxRows={6} maxLength={100000}/>{room.permissions.interact&&<Checkbox label={ft('Ask the AI to reply (uses the owner’s account)')} checked={interact} onChange={event=>setInteract(event.currentTarget.checked)}/>}<Button loading={busy} disabled={!draft.trim()||room.busy} onClick={()=>void submit()}>{ft(interact?'Send to AI':'Send message')}</Button></>:<Text c="dimmed">{ft('Read-only access')}</Text>}
      <Divider label={ft('Shared files')}/><ScrollArea.Autosize mah={180}><Stack gap={4}>{room.snapshot.files.map(file=><Button key={file.id} variant="subtle" justify="start" onClick={()=>void openFile(file)} styles={{label:{whiteSpace:'normal',overflowWrap:'anywhere'}}}>{file.path}</Button>)}</Stack></ScrollArea.Autosize>
      {preview&&<Card withBorder><Group justify="space-between"><Text fw={500}>{preview.file.name}</Text><Button variant="subtle" onClick={()=>{previewController.current?.abort();setPreview(undefined)}}>{ft('Close preview')}</Button></Group>{preview.text!==undefined?<div style={{maxHeight:'45dvh',overflow:'auto'}}>{/\.md$/i.test(preview.file.name)?<SharedMarkdown text={preview.text}/>:<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.text}</pre>}</div>:preview.file.mime.startsWith('image/')?<Image src={preview.url} alt={preview.file.name} fit="contain" mah="50dvh"/>:preview.file.mime.startsWith('audio/')?<audio src={preview.url} controls style={{width:'100%'}}/>:<video src={preview.url} controls style={{maxWidth:'100%',maxHeight:'50dvh'}}/>}</Card>}
      {room.permissions.clone&&<Group><Button variant="light" loading={cloning} disabled={room.snapshot.truncated} onClick={()=>void clone()}>{ft('Clone chat and all files')}</Button>{cloning&&<Button variant="subtle" onClick={()=>controller.current?.abort()}>{ft('Cancel import')}</Button>}</Group>}
    </>}
    {(error||room.error)&&<Alert color="red">{ft(error||room.error||'')}</Alert>}
    <Button variant="default" onClick={()=>collaboration.stop(room.id)}>{ft('Leave shared chat')}</Button>
  </Stack>
}
export function CollaborationContent({sessionId}:{sessionId?:string}){
  useTranslation();useSyncExternalStore(collaboration.subscribe,collaboration.getVersion);const [selected,setSelected]=useState(collaboration.shared(sessionId||'')?.id||''),[code,setCode]=useState(''),[name,setName]=useState(''),[relay,setRelay]=useState(''),[identity,setIdentity]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{initializeCollaboration();void deviceIdentity().then(async key=>setIdentity(await fingerprint(key.publicKey))).catch(()=>{});void platform.getStoreValue('collaboration-display-name').then(value=>{if(typeof value==='string')setName(value.slice(0,60))})},[])
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action()}catch(error){setError(error instanceof Error?error.message:String(error))}finally{setBusy(false)}}
  const scan=async(file:File|null)=>{if(!file)return;await run(async()=>{const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0,canvas.width,canvas.height);const qr=scanQR(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(!qr)throw Error('No pairing QR code found in this image');setCode(qr.data)}finally{bitmap.close()}})}
  const host=collaboration.hosts.get(selected),guest=collaboration.guests.get(selected),rooms=[...[...collaboration.hosts.values()].map(room=>({value:room.id,label:ft('Owner')+' · '+room.title})),...[...collaboration.guests.values()].map(room=>({value:room.id,label:room.snapshot?.title||ft('Collaborative chat')}))]
  return <Stack gap="md"><Text size="sm" c="dimmed">{ft('Peer-to-peer chat. Public relays pair devices; encrypted WebRTC carries messages and files. Direct connections reveal your network address to other participants.')}</Text>
    {sessionId&&!collaboration.shared(sessionId)&&<Button loading={busy} onClick={()=>void run(async()=>{const room=await collaboration.host(sessionId,'owner',undefined,relay||undefined);setSelected(room.id)})}>{ft('Share this chat')}</Button>}
    <Card withBorder><Stack gap="sm"><Text fw={600}>{ft('Join a collaborative chat')}</Text><TextInput label={ft('Your display name')} value={name} maxLength={60} onChange={event=>setName(event.currentTarget.value)}/>{identity&&<Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{ft('Your participant ID')}: {identity}</Text>}
      <Textarea label={ft('Pairing code')} value={code} onChange={event=>setCode(event.currentTarget.value.slice(0,700))} autosize minRows={2} maxRows={4}/><Group><FileButton onChange={file=>void scan(file)} accept="image/*" capture="environment"><Button variant="default" leftSection={<IconQrcode size={16}/>}>{ft('Scan a QR image')}</Button></FileButton><Button loading={busy} disabled={!name.trim()||!code.trim()} onClick={()=>void run(async()=>{await platform.setStoreValue('collaboration-display-name',name.trim());const room=await collaboration.join(code,name,relay||undefined);setSelected(room.id)})}>{ft('Join chat')}</Button></Group>
      <TextInput label={ft('Custom signaling relay (optional)')} placeholder="wss://…" value={relay} maxLength={300} onChange={event=>setRelay(event.currentTarget.value)}/>
    </Stack></Card>
    {error&&<Alert color="red">{ft(error)}</Alert>}
    {rooms.length>0&&<Select label={ft('Active shared sessions')} data={rooms} value={selected} onChange={value=>setSelected(value||'')} allowDeselect={false} comboboxProps={{withinPortal:false}}/>}
    {host?<HostView room={host}/>:guest?<GuestView key={guest.id} room={guest}/>:rooms.length>0&&<Text c="dimmed">{ft('Select an active shared session')}</Text>}
    <Text size="xs" c="dimmed">{ft('Clone permission controls import in the app. Anyone who can read content can still copy it manually. Revoking access does not erase copies already made.')}</Text>
  </Stack>
}
const CollaborationModal=NiceModal.create(({sessionId}:{sessionId?:string})=>{const modal=useModal();usePrivacyDismiss(modal,null);return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve(null);modal.remove()}} title={ft('Collaborative chats')} size="xl"><CollaborationContent sessionId={sessionId}/></AdaptiveModal>})
export async function openCollaborationPanel(sessionId?:string){initializeCollaboration();await NiceModal.show(CollaborationModal,{sessionId})}
