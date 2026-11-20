import { Alert,Button,Checkbox,Group,NumberInput,Stack,Text } from '@mantine/core'
import { useEffect,useMemo,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LocalMCPClientTokenSchema,defaultLocalMCPPermissions,localMCPClientConfiguration,type LocalMCPPermissions,type LocalMCPStart,type LocalMCPState } from '@shared/local-mcp'
import platform from '@/platform'
import { forkT as ft } from '@/i18n/fork'
import { disableMCPStartup, mcpProfileRemembersToken, mcpProfileStartsAutomatically, readMCPProfileToken, readMCPProfiles, saveMCPProfile, startupErrors } from '@/packages/local-mcp/profiles'
import { MCPAccessToken, newMCPAccessToken } from './MCPAccessToken'
type Control = (command:'start'|'stop'|'status',input?:LocalMCPStart,accessToken?:string)=>Promise<LocalMCPState>
const control=async(sessionId:string,command:'start'|'stop'|'status',input?:LocalMCPStart,accessToken?:string):Promise<LocalMCPState>=>{
  if(command==='start'&&input){const {vaultRuntimeFor}=await import('@/packages/vault/runtime');const vault=vaultRuntimeFor(platform);if(!await vault.available())throw new Error('Device encryption is unavailable');await vault.projects.assertSession(input.sessionId)}
  if(command==='stop'){
    await disableMCPStartup('chat:'+sessionId).finally(()=>window.electronAPI.invoke('local-mcp:control','stop-chat',sessionId))
    return {running:false}
  }
  if (command==='start'&&accessToken!==undefined) return window.electronAPI.invoke('local-mcp:control','start-with-token',{config:input,accessToken})
  return window.electronAPI.invoke('local-mcp:control',command==='status'?'chat-status':command,command==='status'?sessionId:input)
}
const labels:Record<Exclude<keyof LocalMCPPermissions,'knowledge'>,string>={readFiles:'Read this chat’s files and generated media',writeFiles:'Create, change and permanently delete session files',execute:'Run isolated JavaScript and optional Python',models:'Call configured text models',automaticModels:'Automatically approve external model calls (may incur costs)',venice:'Use Venice Studio tools with the chat’s existing approval policy',search:'Use the configured web search and link reader',forwardMCP:'Forward tools from other enabled MCP services',multiAgent:'Run and manage this Work chat’s agents (model charges may apply)'}
export function LocalMCPSettings({sessionId,invoke:override}:{sessionId:string;invoke?:Control}){
  useTranslation()
  const invoke=useMemo<Control>(()=>override||((command,input,token)=>control(sessionId,command,input,token)),[override,sessionId])
  const [state,setState]=useState<LocalMCPState>({running:false}),[permissions,setPermissions]=useState({...defaultLocalMCPPermissions}),[port,setPort]=useState<number>(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false)
  const [autoStart,setAutoStart]=useState(false),[keepWhileLocked,setKeepWhileLocked]=useState(false)
  const [accessToken,setAccessToken]=useState(newMCPAccessToken),[rememberToken,setRememberToken]=useState(false)
  const [loadingProfile,setLoadingProfile]=useState(!override&&platform.type==='desktop')
  const available=platform.type==='desktop'||!!override
  useEffect(()=>{
    if(!available||override)return
    let active=true
    void readMCPProfiles().then(async profiles=>{
      const profile=profiles.find(row=>!row.application&&row.sessionId===sessionId)
      if(!active||!profile)return
      setPermissions(profile.permissions);setPort(profile.port);setAutoStart(mcpProfileStartsAutomatically(profile));setKeepWhileLocked(!!profile.keepWhileLocked)
      setRememberToken(mcpProfileRemembersToken(profile))
      const saved = await readMCPProfileToken(profile)
      if (active && saved !== undefined) setAccessToken(saved)
    }).catch(reason=>{if(active)setError(String((reason as Error).message||reason))}).finally(()=>{if(active)setLoadingProfile(false)})
    return()=>{active=false}
  },[available,override,sessionId])
  useEffect(()=>{if(!available)return;let active=true;void invoke('status').then(value=>active&&setState(value)).catch(reason=>active&&setError(String(reason)));const focus=()=>{void invoke('status').then(value=>active&&setState(value)).catch(()=>{})};window.addEventListener('focus',focus);window.addEventListener('chatbox:privacy-lock',focus);window.addEventListener('local-mcp:state-changed',focus);return()=>{active=false;window.removeEventListener('focus',focus);window.removeEventListener('chatbox:privacy-lock',focus);window.removeEventListener('local-mcp:state-changed',focus)}},[invoke,sessionId,available])
  const run=async(action:()=>Promise<LocalMCPState>)=>{setBusy(true);setError('');setCopied(false);try{setState(await action());window.dispatchEvent(new Event('local-mcp:state-changed'))}catch(reason){setError(String((reason as Error)?.message||reason))}finally{setBusy(false)}}
  const change=(name:keyof LocalMCPPermissions,value:boolean)=>setPermissions(previous=>({...previous,[name]:value,...(!value&&(name==='readFiles'||name==='writeFiles')?{execute:false}:{}),...(!value&&name==='models'?{automaticModels:false}:{})}))
  const start=async()=>{
    const config:LocalMCPStart={sessionId,port,permissions,...(keepWhileLocked?{keepWhileLocked:true}:{})}
    const result=await invoke('start',config,accessToken)
    if(!override&&result.running){
      try{const profile=await saveMCPProfile(config,result,{autoStart,rememberToken});setPort(profile.port)}catch(error){await window.electronAPI.invoke('local-mcp:control','stop-chat',sessionId);throw error}
      startupErrors.delete('chat:'+sessionId)
    }
    return result
  }
  return <Stack gap="sm">
    <Text size="sm" c="dimmed">{ft('Share selected features of this chat with a trusted MCP client on this computer.')}</Text>
    {!available?<Text size="sm">{ft('The local MCP server is available in the desktop app.')}</Text>:<>
      {error&&<Alert color="red">{ft(error)}</Alert>}
      {state.running?<Stack gap="xs"><Alert color="blue">{ft('This chat is shared with local MCP clients.')}</Alert><Text size="sm" style={{overflowWrap:'anywhere'}}>{state.url}</Text>
        <MCPAccessToken value={state.accessToken??state.token}/>
        <Text size="xs" c="dimmed">{ft('Copy the token only into a trusted MCP client. Stopping sharing turns off automatic startup.')}</Text>
        {autoStart&&<Text size="xs">{ft('Starts automatically')}</Text>}
        {state.keepWhileLocked&&<Text size="xs">{ft('Stays connected while locked')}</Text>}
        <Group gap="xs"><Button size="sm" variant="default" onClick={()=>{if(!state.running)return;void navigator.clipboard.writeText(JSON.stringify(localMCPClientConfiguration(state),null,2)).then(()=>setCopied(true)).catch(()=>setError('Could not copy the MCP configuration'))}}>{copied?ft('Copied'):ft('Copy MCP client configuration')}</Button><Button size="sm" color="red" loading={busy} onClick={()=>void run(async()=>{const status=await invoke('stop');setAutoStart(false);if(!rememberToken)setAccessToken(newMCPAccessToken());return status})}>{ft('Stop sharing')}</Button></Group>
      </Stack>:<>
        {(Object.entries(labels) as [keyof LocalMCPPermissions,string][]).map(([name,label])=><Checkbox key={name} label={ft(label)} checked={permissions[name]} disabled={busy||name==='execute'&&(!permissions.readFiles||!permissions.writeFiles)||name==='automaticModels'&&!permissions.models} onChange={event=>change(name,event.currentTarget.checked)}/>)}
        <Text size="xs" c="dimmed">{ft('Model calls require approval unless automatic calls are granted here. Venice media keeps its existing approval policy. Forwarded MCP services keep their own permissions and may access data outside this chat.')}</Text>
        {permissions.multiAgent&&<Alert color="yellow">{ft('Enable multi-agent mode in this Work chat first. External workers inherit only the features shared here and the chat’s agent policy. Guardians still review transfers. Stopping MCP sharing cancels its workers. This permission allows worker and guardian model charges.')}</Alert>}
        <NumberInput label={ft('Local MCP port (0 = automatic)')} value={port} min={0} max={65535} allowDecimal={false} onChange={value=>setPort(typeof value==='number'?value:0)}/>
        <MCPAccessToken value={accessToken} onChange={setAccessToken} remember={rememberToken} onRemember={setRememberToken} busy={busy||loadingProfile}/>
        <Checkbox checked={autoStart} disabled={busy} label={ft('Start automatically with Chatbox')} onChange={event=>setAutoStart(event.currentTarget.checked)}/>
        <Checkbox checked={keepWhileLocked} disabled={busy} label={ft('Keep endpoint active while the app is locked')} description={ft('The connection stays open. Chat tools and files are available after unlock.')} onChange={event=>setKeepWhileLocked(event.currentTarget.checked)}/>
        {startupErrors.has('chat:'+sessionId)&&<Alert color="yellow">{ft('Automatic startup failed. Check the port and start the endpoint again.')}</Alert>}
        <Button size="sm" loading={busy||loadingProfile} disabled={!LocalMCPClientTokenSchema.safeParse(accessToken).success} onClick={()=>void run(start)}>{ft('Start sharing this chat')}</Button>
      </>}
    </>}
  </Stack>
}
