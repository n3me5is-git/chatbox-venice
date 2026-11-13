import { Alert,Button,Checkbox,Group,NumberInput,PasswordInput,Stack,Text } from '@mantine/core'
import { useEffect,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultLocalMCPPermissions,localMCPClientConfiguration,type LocalMCPPermissions,type LocalMCPStart,type LocalMCPState } from '@shared/local-mcp'
import platform from '@/platform'
import { forkT as ft } from '@/i18n/fork'
const control=async(command:'start'|'stop'|'status',input?:LocalMCPStart):Promise<LocalMCPState>=>{
  if(command==='start'&&input){const {vaultRuntimeFor}=await import('@/packages/vault/runtime');const vault=vaultRuntimeFor(platform);if(!await vault.available())throw new Error('Device encryption is unavailable');await vault.projects.assertSession(input.sessionId)}
  return window.electronAPI.invoke('local-mcp:control',command,input)
}
const labels:Record<Exclude<keyof LocalMCPPermissions,'knowledge'>,string>={readFiles:'Read this chat’s files and generated media',writeFiles:'Create, change and permanently delete session files',execute:'Run isolated JavaScript and optional Python',models:'Call configured text models',automaticModels:'Automatically approve external model calls (may incur costs)',venice:'Use Venice Studio tools with the chat’s existing approval policy',search:'Use the configured web search and link reader',forwardMCP:'Forward tools from other enabled MCP services',multiAgent:'Run and manage this Work chat’s agents (model charges may apply)'}
export function LocalMCPSettings({sessionId,invoke=control}:{sessionId:string;invoke?:typeof control}){
  useTranslation()
  const [state,setState]=useState<LocalMCPState>({running:false}),[permissions,setPermissions]=useState({...defaultLocalMCPPermissions}),[port,setPort]=useState<number>(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false)
  const available=platform.type==='desktop'||invoke!==control
  useEffect(()=>{if(!available)return;let active=true;void invoke('status').then(value=>active&&setState(value)).catch(reason=>active&&setError(String(reason)));const focus=()=>{void invoke('status').then(value=>active&&setState(value)).catch(()=>{})};window.addEventListener('focus',focus);window.addEventListener('chatbox:privacy-lock',focus);window.addEventListener('local-mcp:state-changed',focus);return()=>{active=false;window.removeEventListener('focus',focus);window.removeEventListener('chatbox:privacy-lock',focus);window.removeEventListener('local-mcp:state-changed',focus)}},[invoke,sessionId,available])
  const run=async(action:()=>Promise<LocalMCPState>)=>{setBusy(true);setError('');setCopied(false);try{setState(await action());window.dispatchEvent(new Event('local-mcp:state-changed'))}catch(reason){setError(String((reason as Error)?.message||reason))}finally{setBusy(false)}}
  const change=(name:keyof LocalMCPPermissions,value:boolean)=>setPermissions(previous=>({...previous,[name]:value,...(!value&&(name==='readFiles'||name==='writeFiles')?{execute:false}:{}),...(!value&&name==='models'?{automaticModels:false}:{})}))
  return <Stack gap="xs"><Text fw={500}>{ft('Share this chat through MCP')}</Text>
    <Text size="xs" c="dimmed">{ft('Let a trusted agent on this computer use selected app features. The server is off by default, binds only to 127.0.0.1, and uses a revocable local token. Provider API keys stay in the app. Locking the app or changing protection settings stops sharing.')}</Text>
    {!available?<Text size="sm">{ft('The local MCP server is available in the desktop app.')}</Text>:<>
      {error&&<Alert color="red">{ft(error)}</Alert>}
      {state.running?<Stack gap="xs"><Alert color="blue">{state.sessionId===sessionId?ft('This chat is shared with local MCP clients.'):ft('Another chat is currently shared. Stop it before sharing this one.')}</Alert><Text size="sm" style={{overflowWrap:'anywhere'}}>{state.url}</Text>
        <PasswordInput label={ft('Local MCP access token')} value={state.token} readOnly/>
        <Text size="xs" c="dimmed">{ft('Anyone with this token on this computer can use the granted features. Copy it only into a trusted MCP client. Stopping and restarting creates a new token.')}</Text>
        <Group gap="xs"><Button size="xs" variant="default" onClick={()=>{if(!state.running)return;void navigator.clipboard.writeText(JSON.stringify(localMCPClientConfiguration(state),null,2)).then(()=>setCopied(true)).catch(()=>setError('Could not copy the MCP configuration'))}}>{copied?ft('Copied'):ft('Copy MCP client configuration')}</Button><Button size="xs" color="red" loading={busy} onClick={()=>void run(()=>invoke('stop'))}>{ft('Stop sharing')}</Button></Group>
      </Stack>:<>
        {(Object.entries(labels) as [keyof LocalMCPPermissions,string][]).map(([name,label])=><Checkbox key={name} label={ft(label)} checked={permissions[name]} disabled={busy||name==='execute'&&(!permissions.readFiles||!permissions.writeFiles)||name==='automaticModels'&&!permissions.models} onChange={event=>change(name,event.currentTarget.checked)}/>)}
        <Text size="xs" c="dimmed">{ft('Model calls require approval unless automatic calls are granted here. Venice media keeps its existing approval policy. Forwarded MCP services keep their own permissions and may access data outside this chat.')}</Text>
        {permissions.multiAgent&&<Alert color="yellow">{ft('Enable multi-agent mode in this Work chat first. External workers inherit only the features shared here and the chat’s agent policy. Guardians still review transfers. Stopping MCP sharing cancels its workers. This permission allows worker and guardian model charges.')}</Alert>}
        <NumberInput label={ft('Local MCP port (0 = automatic)')} value={port} min={0} max={65535} allowDecimal={false} onChange={value=>setPort(typeof value==='number'?value:0)}/>
        <Button size="xs" loading={busy} onClick={()=>void run(()=>invoke('start',{sessionId,port,permissions}))}>{ft('Start sharing this chat')}</Button>
      </>}
    </>}
  </Stack>
}
