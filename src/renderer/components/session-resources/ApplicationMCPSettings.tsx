import {ChatKnowledgeCollections} from '@/components/knowledge-base/ChatKnowledgeCollections'
import {Alert,Button,Checkbox,Group,NativeSelect,NumberInput,Stack,Text,TextInput} from '@mantine/core'
import {useEffect,useState} from 'react'
import {useTranslation} from 'react-i18next'
import {LocalMCPClientTokenSchema,defaultLocalMCPPermissions,localMCPClientConfiguration,LocalMCPApplicationSchema,type LocalMCPGrant,type LocalMCPPermissions,type LocalMCPStart} from '@shared/local-mcp'
import {forkT as ft} from '@/i18n/fork'
import platform from '@/platform'
import {settingsStore} from '@/stores/settingsStore'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import {cleanupInactiveMCPContexts,revokeApplicationMCP} from '@/packages/local-mcp/application'
import {disableMCPStartup,mcpProfileRemembersToken,mcpProfileStartsAutomatically,readMCPProfileToken,readMCPProfiles,saveMCPProfile,startSavedMCPProfile,startupErrors,updateMCPProfiles,type LocalMCPProfile} from '@/packages/local-mcp/profiles'
import { MCPAccessToken, newMCPAccessToken } from './MCPAccessToken'
const labels:Record<keyof LocalMCPPermissions,string>={readFiles:'Read files and retrieve generated results',writeFiles:'Upload, create, edit and delete workspace files',execute:'Run isolated JavaScript and optional Python',models:'Call configured text models',automaticModels:'Automatically approve external model calls (may incur costs)',venice:'Use Venice Studio generation APIs',search:'Use the configured web search and link reader',forwardMCP:'Forward tools from other enabled MCP services',multiAgent:'Run and manage permitted agents (model charges may apply)',knowledge:'Search explicitly granted knowledge collections (provider charges may apply)'}
const modes=['full','shadow','router'] as const
export function ApplicationMCPSettings(){
  useTranslation()
  const [knowledgeCollectionIds,setKnowledgeCollectionIds]=useState<number[]>([])
  const [knowledgeFilePaths,setKnowledgeFilePaths]=useState(false)
  const [veniceSearch,setVeniceSearch]=useState(false)
  const [accessToken,setAccessToken]=useState(newMCPAccessToken),[rememberToken,setRememberToken]=useState(false)
  const [profiles,setProfiles]=useState<LocalMCPProfile[]>([]),[editingId,setEditingId]=useState<string|null>(null)
  const [autoStart,setAutoStart]=useState(false),[keepWhileLocked,setKeepWhileLocked]=useState(false)
  const [allowOperationsWhileLocked, setAllowOperationsWhileLocked] = useState(false)
  const [endpoints,setEndpoints]=useState<LocalMCPGrant[]>([]),[name,setName]=useState('Local agent'),[mode,setMode]=useState<typeof modes[number]>('router'),[port,setPort]=useState(0),[permissions,setPermissions]=useState<LocalMCPPermissions>({...defaultLocalMCPPermissions,models:true}),[privacy,setPrivacy]=useState<'auto'|'e2ee'|'tee'>('auto'),[manage,setManage]=useState(false),[conversations,setConversations]=useState(false),[automaticStudio,setAutomaticStudio]=useState(false),[externalTools,setExternalTools]=useState(false),[providers,setProviders]=useState<string[]>(['venice']),[allProviders,setAllProviders]=useState(false),[agents,setAgents]=useState<{id:string;title:string}[]>([]),[dedicatedIds,setDedicatedIds]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const available=platform.type==='desktop',invoke=(command:string,input?:unknown)=>window.electronAPI.invoke('local-mcp:control',command,input)
  const refresh=async()=>{setEndpoints((await invoke('list') as LocalMCPGrant[]).filter(endpoint=>endpoint.application));setProfiles((await readMCPProfiles()).filter(profile=>profile.application))}
  useEffect(()=>{if(!available)return;let active=true;const update=()=>{void Promise.all([invoke('list') as Promise<LocalMCPGrant[]>,readMCPProfiles()]).then(([live,saved])=>{if(active){setEndpoints(live.filter(endpoint=>endpoint.application));setProfiles(saved.filter(profile=>profile.application))}}).catch(()=>{})};update();window.addEventListener('local-mcp:state-changed',update);window.addEventListener('focus',update);return()=>{active=false;window.removeEventListener('local-mcp:state-changed',update);window.removeEventListener('focus',update)}},[available])
  useEffect(()=>{if(!available||!permissions.multiAgent)return;let active=true;void import('@/packages/multi-agent/library').then(module=>module.listDedicatedAgents()).then(items=>{if(active)setAgents(items.map(({id,title})=>({id,title})))}).catch(reason=>setError(String(reason.message||reason)));return()=>{active=false}},[available,permissions.multiAgent])
  const run=async(work:()=>Promise<unknown>)=>{setBusy(true);setError('');setNotice('');try{await work();await refresh();window.dispatchEvent(new Event('local-mcp:state-changed'))}catch(reason){setError(String((reason as Error).message||reason))}finally{setBusy(false)}}
  const change=(key:keyof LocalMCPPermissions,value:boolean)=>setPermissions(old=>({...old,[key]:value,...(!value&&(key==='readFiles'||key==='writeFiles')?{execute:false}:{}),...(!value&&key==='models'?{automaticModels:false}:{})}))
  const canUseVenice = privacy !== 'auto' || allProviders || providers.includes('venice')
  const resetEditing = () => {
    setEditingId(null);setAutoStart(false);setKeepWhileLocked(false);setAllowOperationsWhileLocked(false)
    setAccessToken(newMCPAccessToken());setRememberToken(false);setKnowledgeFilePaths(false);setVeniceSearch(false)
  }
  const edit = (profile: LocalMCPProfile) => run(async () => {
    const app=profile.application!
    setEditingId(profile.endpointId||null);setName(app.name);setMode(app.mode);setPort(profile.port)
    setPermissions(profile.permissions);setPrivacy(app.privacy);setManage(app.manageChats)
    setConversations(app.conversations);setAutomaticStudio(app.automaticStudio);setExternalTools(app.externalTools)
    setAllProviders(!app.providers);setProviders(app.providers||[]);setDedicatedIds(app.dedicatedIds)
    setKnowledgeCollectionIds(app.knowledgeCollectionIds||[]);setKnowledgeFilePaths(!!app.knowledgeFilePaths);setVeniceSearch(!!app.veniceSearch)
    setAutoStart(mcpProfileStartsAutomatically(profile));setKeepWhileLocked(!!profile.keepWhileLocked);setAllowOperationsWhileLocked(!!profile.allowOperationsWhileLocked)
    setRememberToken(mcpProfileRemembersToken(profile));setAccessToken(newMCPAccessToken())
    const saved = await readMCPProfileToken(profile)
    if (saved !== undefined) setAccessToken(saved)
  })
  const start=()=>run(async()=>{
    if(mode!=='router'&&permissions.knowledge&&!knowledgeCollectionIds.length)throw Error('Select at least one knowledge collection for this endpoint')
    if(port!==0&&port<1024)throw Error('Choose automatic port 0 or a port from 1024 to 65535')
    const vault=vaultRuntimeFor(platform);await vault.projects.assertApp();if(!await vault.available())throw Error('Device encryption is unavailable')
    await cleanupInactiveMCPContexts()
    const shareKnowledge = mode !== 'router' && permissions.knowledge
    const application=LocalMCPApplicationSchema.parse({name,mode,manageChats:mode==='full'&&manage,conversations:mode!=='router'&&conversations,providers:privacy==='auto'?(allProviders?undefined:providers):['venice'],privacy,dedicatedIds:permissions.multiAgent?dedicatedIds:[],automaticStudio,externalTools,knowledgeCollectionIds:shareKnowledge?knowledgeCollectionIds:undefined,...(shareKnowledge&&knowledgeFilePaths?{knowledgeFilePaths:true}:{}),...(canUseVenice&&veniceSearch?{veniceSearch:true}:{})})
    const config:LocalMCPStart={sessionId:'application',endpointId:editingId||crypto.randomUUID(),port,application,permissions:{...permissions,...(mode==='router'?{execute:false,search:false,forwardMCP:false,multiAgent:false,knowledge:false}: {})},...(keepWhileLocked?{keepWhileLocked:true,...(allowOperationsWhileLocked?{allowOperationsWhileLocked:true}:{})}:{})}
    const endpoint=await invoke('start-with-token',{config,accessToken}) as LocalMCPGrant
    try{await saveMCPProfile(config,endpoint,{autoStart,rememberToken})}catch(error){await invoke('stop-endpoint',config.endpointId);throw error}
    startupErrors.delete(config.endpointId!)
    resetEditing()
  })
  if(!available)return null
  const configured=Object.keys(settingsStore.getState().getSettings().providers||{})
  return <Stack gap="sm"><Text fw={600}>{ft('App-wide MCP servers')}</Text>
    <Text size="sm" c="dimmed">{ft('Run local endpoints with separate ports, tokens and permissions.')}</Text>
    {error&&<Alert color="red">{ft(error)}</Alert>}{notice&&<Alert color="blue">{ft(notice)}</Alert>}
    {endpoints.map(endpoint=><Stack key={endpoint.token} p="sm" style={{border:'1px solid var(--mantine-color-default-border)',borderRadius:8}}>
      <Text fw={500}>{endpoint.application?.name||ft('Shared chat')} · {endpoint.application?ft(endpoint.application.mode==='router'?'Models and Studio only':endpoint.application.mode==='shadow'?'Shadow workspaces only':'Authorized app access'):ft('Single chat')}</Text><Text size="sm" style={{overflowWrap:'anywhere'}}>{endpoint.url}</Text>
      <MCPAccessToken value={endpoint.accessToken??endpoint.token}/>
      {profiles.some(profile=>profile.endpointId===endpoint.endpointId&&mcpProfileStartsAutomatically(profile))&&<Text size="xs">{ft('Starts automatically')}</Text>}
      {endpoint.keepWhileLocked&&<Text size="xs">{ft(endpoint.allowOperationsWhileLocked ? 'Granted operations available while locked' : 'Stays connected while locked')}</Text>}
      <Group><Button size="xs" variant="default" onClick={()=>void run(async()=>{await navigator.clipboard.writeText(JSON.stringify(localMCPClientConfiguration(endpoint),null,2));setNotice('Copied')})}>{ft('Copy MCP client configuration')}</Button>
        <Button size="xs" color="red" loading={busy} onClick={()=>void run(async()=>{await disableMCPStartup(endpoint.endpointId!).finally(()=>invoke('stop-endpoint',endpoint.endpointId));const result=await revokeApplicationMCP(endpoint);if(result?.pending)setNotice('Some temporary workspaces still need cleanup. Unlock their storage and retry cleanup.')})}>{ft('Stop endpoint')}</Button></Group>
    </Stack>)}
    {profiles.filter(profile=>!endpoints.some(endpoint=>endpoint.endpointId===profile.endpointId)).map(profile=><Stack key={profile.endpointId} gap="xs"><Group gap="xs"><Text size="sm">{profile.application?.name}</Text><Button size="xs" variant="light" loading={busy} onClick={()=>void run(async()=>{await cleanupInactiveMCPContexts();await startSavedMCPProfile(profile);startupErrors.delete(profile.endpointId!)})}>{ft('Start saved endpoint')}</Button><Button size="xs" variant="subtle" disabled={busy} onClick={()=>void edit(profile)}>{ft('Edit profile')}</Button><Button size="xs" variant="subtle" color="red" onClick={()=>void run(()=>updateMCPProfiles(rows=>rows.filter(item=>item.endpointId!==profile.endpointId)))}>{ft('Delete profile')}</Button></Group>{startupErrors.has(profile.endpointId!)&&<Text size="xs" c="orange">{ft('Automatic startup failed. Check the port and start the endpoint again.')}</Text>}</Stack>)}
    <TextInput label={ft('Endpoint name')} value={name} maxLength={80} onChange={event=>setName(event.currentTarget.value)}/>
    <NativeSelect label={ft('Access profile')} value={mode} data={[{value:'router',label:ft('Models and Studio only')},{value:'shadow',label:ft('Shadow workspaces only')},{value:'full',label:ft('Authorized app access')}]} onChange={event=>setMode(event.currentTarget.value as typeof mode)}/>
    <Text size="xs" c="dimmed">{ft(mode==='router'?'Route model calls, Studio generation and optional Venice web search through Chatbox.':mode==='shadow'?'Work only inside temporary spaces created by this endpoint. Results are hidden from normal history and deleted on explicit cleanup or endpoint stop.':'Access unlocked root chats and granted app features. Other endpoints’ temporary spaces and protected locked content remain inaccessible.')}</Text>
    <NativeSelect label={ft('Text transport privacy')} value={privacy} onChange={event=>setPrivacy(event.currentTarget.value as typeof privacy)} data={[{value:'auto',label:ft('Auto: strongest supported privacy')},{value:'e2ee',label:ft('Require E2EE text models')},{value:'tee',label:ft('Require TEE or E2EE text models')}]}/>
    <Text size="xs" c="dimmed">{ft('Text privacy requirements apply to LLM calls. Studio images, audio and video use their own Venice APIs and are not E2EE. The external MCP client receives decrypted results locally.')}</Text>
    {privacy==='auto'&&<><Checkbox label={ft('Allow all configured providers')} checked={allProviders} onChange={event=>setAllProviders(event.currentTarget.checked)}/>{!allProviders&&configured.map(id=><Checkbox key={id} label={id} checked={providers.includes(id)} onChange={event=>{const checked=event.currentTarget.checked;setProviders(old=>checked?[...old,id]:old.filter(value=>value!==id))}}/>)}</>}
    {(Object.entries(labels) as [keyof LocalMCPPermissions,string][]).filter(([key])=>mode!=='router'||!['execute','search','forwardMCP','multiAgent','knowledge'].includes(key)).map(([key,label])=><Checkbox key={key} label={ft(label)} checked={permissions[key]??false} disabled={busy||key==='execute'&&(!permissions.readFiles||!permissions.writeFiles)||key==='automaticModels'&&!permissions.models} onChange={event=>change(key,event.currentTarget.checked)}/>)}
    {mode!=='router'&&permissions.knowledge&&<Stack gap="xs">
      <ChatKnowledgeCollections value={knowledgeCollectionIds} onChange={ids=>setKnowledgeCollectionIds(ids||[])} limit={8} title="Knowledge collections granted to this endpoint" description="Only selected collections can be searched or read. Embedding and extraction providers follow each collection’s configuration, independently of the text-model privacy policy. Protected collections require owner unlock. Source files cannot be changed through this grant."/>
      <Checkbox label={ft('Share paths to original files in linked collections')}
        description={ft('Authorized clients can see the full path on this computer when the original file matches the indexed source.')}
        checked={knowledgeFilePaths} disabled={busy} onChange={event=>setKnowledgeFilePaths(event.currentTarget.checked)}/>
    </Stack>}
    {permissions.models&&<Checkbox label={ft('Allow external function schemas for model calls')} checked={externalTools} onChange={event=>setExternalTools(event.currentTarget.checked)}/>}
    {permissions.venice&&<Checkbox label={ft('Automatically approve Studio requests (may incur costs)')} checked={automaticStudio} onChange={event=>setAutomaticStudio(event.currentTarget.checked)}/>}
    {canUseVenice&&<Checkbox label={ft('Expose Venice web search engines separately')}
      description={ft('Clients can send queries to Brave, Google or Exa through Venice. Search may incur charges.')}
      checked={veniceSearch} disabled={busy} onChange={event=>setVeniceSearch(event.currentTarget.checked)}/>}
    {mode!=='router'&&permissions.forwardMCP&&<Alert color="yellow">{ft('Forwarded MCP services keep their own permissions. Shadow cleanup cannot remove files or data they save outside Chatbox.')}</Alert>}
    {mode==='full'&&<Checkbox label={ft('Create, configure and permanently delete chats')} checked={manage} onChange={event=>setManage(event.currentTarget.checked)}/>}
    {mode!=='router'&&<Checkbox label={ft('Read and send messages in authorized chats')} checked={conversations} onChange={event=>setConversations(event.currentTarget.checked)}/>}
    {mode!=='router'&&permissions.multiAgent&&<Stack gap="xs"><Text size="sm">{ft('Dedicated agents available to this endpoint')}</Text>{agents.map(agent=><Checkbox key={agent.id} label={agent.title} checked={dedicatedIds.includes(agent.id)} onChange={event=>{const checked=event.currentTarget.checked;setDedicatedIds(old=>checked?[...old,agent.id]:old.filter(id=>id!==agent.id))}}/>)}</Stack>}
    <NumberInput label={ft('Local MCP port (0 = automatic)')} value={port} min={0} max={65535} allowDecimal={false} onChange={value=>setPort(typeof value==='number'?value:0)}/>
    <MCPAccessToken value={accessToken} onChange={setAccessToken} remember={rememberToken} onRemember={setRememberToken} busy={busy}/>
    <Checkbox checked={autoStart} disabled={busy} label={ft('Start automatically with Chatbox')} description={ft('Reuses this port at startup. Manually stopping the endpoint turns off automatic startup.')} onChange={event=>setAutoStart(event.currentTarget.checked)}/>
    <Checkbox checked={keepWhileLocked} disabled={busy} label={ft('Keep endpoint active while the app is locked')} description={ft('Model routers can read permitted text and Studio catalogs and make preapproved text calls while locked.')} onChange={event=>setKeepWhileLocked(event.currentTarget.checked)}/>
    {keepWhileLocked && <Checkbox checked={allowOperationsWhileLocked} disabled={busy}
      label={ft('Allow granted operations while locked')}
      description={ft('This endpoint can use its granted tools and unprotected data behind the lock screen. Protected data and requests that need your approval still require unlock.')}
      onChange={event => setAllowOperationsWhileLocked(event.currentTarget.checked)} />}
    <Group><Button size="xs" loading={busy} disabled={!name.trim()||!LocalMCPClientTokenSchema.safeParse(accessToken).success} onClick={()=>void start()}>{ft(editingId?'Save and start endpoint':'Start new endpoint')}</Button>{editingId&&<Button size="xs" variant="subtle" onClick={resetEditing}>{ft('Cancel profile editing')}</Button>}<Button size="xs" variant="default" loading={busy} onClick={()=>void run(async()=>{const result=await cleanupInactiveMCPContexts();setNotice(result.pending?'Some temporary workspaces still need cleanup. Unlock their storage and retry cleanup.':'Temporary workspace cleanup completed')})}>{ft('Clean up stopped endpoints')}</Button>{endpoints.length>0&&<Button size="xs" variant="subtle" color="red" onClick={()=>void run(async()=>{await disableMCPStartup('all').finally(()=>invoke('stop-all'));await Promise.all(endpoints.map(revokeApplicationMCP))})}>{ft('Stop all MCP endpoints')}</Button>}</Group>
  </Stack>
}
