import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { ActionIcon,Alert,Badge,Button,Card,Checkbox,Collapse,FileButton,Group,Image,PasswordInput,Radio,Select,Stack,Tabs,Text,Textarea,TextInput } from '@mantine/core'
import { IconCopy,IconQrcode,IconRefresh,IconTrash } from '@tabler/icons-react'
import { lazy,Suspense,useCallback,useEffect,useState,useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { HitlPolicy,SharePermissions } from '@shared/collaboration'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { usePrivacyDismiss } from '@/components/security/usePrivacyDismiss'
import { collaboration,initializeCollaboration,openRemoteChat } from '@/packages/collaboration/runtime'
import type { HostShare } from '@/packages/collaboration/hub'
import { deviceIdentity,qrSvg } from '@/packages/collaboration/transport'
import { fingerprint } from '@/packages/collaboration/crypto'
import { copyToClipboard } from '@/packages/navigator'
import platform from '@/platform'
import { forkT as ft } from '@/i18n/fork'
import { HitlCard } from './HitlCard'
import { PairingScanner } from './PairingScanner'
import { pairingFromImage } from '@/packages/collaboration/qr'
import { collaborationError } from '@/packages/collaboration/errors'
import type { ConnectionOptions } from '@/packages/collaboration/network'
const DirectTransferContent=lazy(()=>import('./DirectTransfer').then(module=>({default:module.DirectTransferContent})))

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
export function CollaborationContent({sessionId,onOpenRemote,remoteId}:{sessionId?:string;onOpenRemote?:()=>void;remoteId?:string}){
  useTranslation();useSyncExternalStore(collaboration.subscribe,collaboration.getVersion);const [selected,setSelected]=useState(remoteId||collaboration.shared(sessionId||'')?.id||''),[code,setCode]=useState(''),[name,setName]=useState(''),[relay,setRelay]=useState(''),[identity,setIdentity]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[scanning,setScanning]=useState(false),[networkOpen,setNetworkOpen]=useState(false),[turnUrl,setTurnUrl]=useState(''),[turnUsername,setTurnUsername]=useState(''),[turnCredential,setTurnCredential]=useState(''),[relayOnly,setRelayOnly]=useState(false)
  const network:ConnectionOptions={turnUrl:turnUrl.trim(),turnUsername:turnUsername.trim(),turnCredential,relayOnly}
  const closeScanner=useCallback(()=>setScanning(false),[])
  const scanned=useCallback((value:string)=>{setCode(value);setError('');setScanning(false)},[])
  useEffect(()=>{initializeCollaboration();void deviceIdentity().then(async key=>setIdentity(await fingerprint(key.publicKey))).catch(()=>{});void platform.getStoreValue('collaboration-display-name').then(value=>{if(typeof value==='string')setName(value.slice(0,60))})},[])
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action()}catch(error){setError(collaborationError(error))}finally{setBusy(false)}}
  const scan=async(file:File|null)=>{if(!file)return;await run(async()=>scanned(await pairingFromImage(file)))}
  const host=collaboration.hosts.get(selected),guest=collaboration.guests.get(selected),rooms=[...[...collaboration.hosts.values()].map(room=>({value:room.id,label:ft('Owner')+' · '+room.title})),...[...collaboration.guests.values()].map(room=>({value:room.id,label:room.snapshot?.title||ft('Collaborative chat')}))]
  return <Stack gap="md"><Text size="sm" c="dimmed">{ft('Peer-to-peer chat. Public relays pair devices; encrypted WebRTC carries messages and files. Direct connections reveal your network address to other participants.')}</Text>
    {sessionId&&!collaboration.shared(sessionId)&&<Button loading={busy} onClick={()=>void run(async()=>{const room=await collaboration.host(sessionId,'owner',undefined,relay||undefined,network);setSelected(room.id)})}>{ft('Share this chat')}</Button>}
    <Card withBorder><Stack gap="sm"><Text fw={600}>{ft('Join a collaborative chat')}</Text><Text size="xs" c="dimmed">{ft('Both devices need Chatbox Venice 1.35.1 or later. Create a new pairing code after updating.')}</Text><TextInput label={ft('Your display name')} value={name} maxLength={60} onChange={event=>setName(event.currentTarget.value)}/>{identity&&<Text size="xs" c="dimmed" style={{overflowWrap:'anywhere'}}>{ft('Your participant ID')}: {identity}</Text>}
      <Textarea label={ft('Pairing code')} value={code} onChange={event=>setCode(event.currentTarget.value.slice(0,700))} autosize minRows={2} maxRows={4}/><Group><Button variant="default" leftSection={<IconQrcode size={16}/>} disabled={scanning} onClick={()=>{setError('');setScanning(true)}}>{ft('Scan with camera')}</Button><FileButton onChange={file=>void scan(file)} accept="image/*">{props=><Button {...props} variant="default" leftSection={<IconQrcode size={16}/>}>{ft('Upload QR image')}</Button>}</FileButton><Button loading={busy} disabled={!name.trim()||!code.trim()} onClick={()=>void run(async()=>{await platform.setStoreValue('collaboration-display-name',name.trim());const room=await collaboration.join(code,name,relay||undefined,network);setSelected(room.id);await openRemoteChat(room.id);onOpenRemote?.()})}>{ft('Join chat')}</Button></Group>
      {scanning&&<PairingScanner onCode={scanned} onClose={closeScanner}/>}
    </Stack></Card>
    <Button variant="subtle" onClick={()=>setNetworkOpen(!networkOpen)}>{ft('Connection options')}</Button>
    <Collapse in={networkOpen}><Card withBorder><Stack gap="sm">
      <Text size="sm">{ft('STUN tries a direct connection. TURN relays encrypted traffic when direct connections are blocked. Configure TURN on both devices; credentials stay in this panel and are never added to the QR code.')}</Text>
      <TextInput label={ft('Custom signaling relay (optional)')} placeholder="wss://…" value={relay} maxLength={300} onChange={event=>setRelay(event.currentTarget.value)}/>
      <TextInput label={ft('TURN relay address (optional)')} placeholder="turns:relay.example.com:443?transport=tcp" value={turnUrl} maxLength={300} onChange={event=>setTurnUrl(event.currentTarget.value)}/>
      <TextInput label={ft('TURN username')} value={turnUsername} autoComplete="off" maxLength={512} onChange={event=>setTurnUsername(event.currentTarget.value)}/>
      <PasswordInput label={ft('TURN password')} value={turnCredential} autoComplete="new-password" maxLength={2048} onChange={event=>setTurnCredential(event.currentTarget.value)}/>
      <Checkbox label={ft('Use TURN only')} checked={relayOnly} onChange={event=>setRelayOnly(event.currentTarget.checked)}/>
      <Text size="xs" c="dimmed">{ft('Connection changes apply to new connections. Stop and share again to change the owner’s connection options. A signaling relay alone cannot bypass blocked WebRTC.')}</Text>
    </Stack></Card></Collapse>
    {error&&<Alert color="red">{ft(error)}</Alert>}
    {rooms.length>0&&<Select label={ft('Active shared sessions')} data={rooms} value={selected} onChange={value=>setSelected(value||'')} allowDeselect={false} comboboxProps={{withinPortal:false}}/>}
    {host?<HostView room={host}/>:guest?<Stack><Text fw={600}>{guest.snapshot?.title||ft('Remote chat')}</Text><Badge>{ft(guest.status==='connected'?'Connected':guest.status==='waiting'?'Waiting for owner approval':guest.status==='connecting'?'Connecting…':'Disconnected')}</Badge><Button onClick={()=>{void openRemoteChat(guest.id);onOpenRemote?.()}}>{ft('Open remote chat')}</Button>{(guest.status==='disconnected'||guest.error)&&<Button loading={busy} leftSection={<IconRefresh size={16}/>} onClick={()=>void run(async()=>{collaboration.stop(guest.id);const room=await collaboration.join(guest.code,guest.name,relay||undefined,network);setSelected(room.id);await openRemoteChat(room.id);onOpenRemote?.()})}>{ft('Retry connection')}</Button>}{guest.error&&<Alert color="red">{ft(guest.error)}</Alert>}<Button variant="default" onClick={()=>collaboration.stop(guest.id)}>{ft('Leave shared chat')}</Button></Stack>:rooms.length>0&&<Text c="dimmed">{ft('Select an active shared session')}</Text>}
    <Text size="xs" c="dimmed">{ft('Clone permission controls import in the app. Anyone who can read content can still copy it manually. Revoking access does not erase copies already made.')}</Text>
  </Stack>
}
const CollaborationModal=NiceModal.create(({sessionId,transfer=false,remoteId}:{sessionId?:string;transfer?:boolean;remoteId?:string})=>{const modal=useModal();usePrivacyDismiss(modal,null);return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve(null);modal.remove()}} title={ft('Sharing and device transfer')} size="xl"><Tabs defaultValue={transfer?'receive':'collaborate'} keepMounted={false}><Tabs.List mb="md"><Tabs.Tab value="collaborate">{ft('Collaboration')}</Tabs.Tab><Tabs.Tab value="receive">{ft('Receive / transfer')}</Tabs.Tab></Tabs.List><Tabs.Panel value="collaborate"><CollaborationContent sessionId={sessionId} remoteId={remoteId} onOpenRemote={()=>{modal.resolve(null);modal.remove()}}/></Tabs.Panel><Tabs.Panel value="receive"><Suspense fallback={null}><DirectTransferContent sessionId={sessionId}/></Suspense></Tabs.Panel></Tabs></AdaptiveModal>})
export async function openCollaborationPanel(sessionId?:string,remoteId?:string){initializeCollaboration();await NiceModal.show(CollaborationModal,{sessionId,remoteId})}
export async function openDirectTransferPanel(sessionId?:string){initializeCollaboration();await NiceModal.show(CollaborationModal,{sessionId,transfer:true})}
