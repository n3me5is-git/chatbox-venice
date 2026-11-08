import { Alert,Button,Checkbox,Group,MultiSelect,Stack,Text } from '@mantine/core'
import { useEffect,useRef,useState } from 'react'
import type { sessionResourceAPI } from '@/packages/session-resources/api'
import { forkT as ft } from '@/i18n/fork'
type API=Pick<typeof sessionResourceAPI,'pythonStatus'|'installPython'|'clearPython'|'configurePython'>
const packages=['numpy','pandas','matplotlib','sympy','pillow','scipy','scikit-learn','beautifulsoup4','lxml']
export function PythonSettings({sessionId,enabled,onReady,api,onChanged}:{sessionId:string;enabled:boolean;onReady:(ready:boolean)=>void;api:API;onChanged:()=>void}){
  const [status,setStatus]=useState<{ready:boolean;bytes:number;packages:string[]}>(),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('')
  const abort=useRef<AbortController>()
  const refresh=async()=>{const value=await api.pythonStatus();setStatus(value);setSelected(value.packages);onReady(value.ready)}
  useEffect(()=>{let active=true;void api.pythonStatus().then(value=>{if(active){setStatus(value);setSelected(value.packages);onReady(value.ready)}}).catch(reason=>active&&setError(String(reason)));return()=>{active=false;abort.current?.abort()}},[api,sessionId])
  const run=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();await refresh();onChanged()}catch(reason){setError((reason as Error).message||String(reason))}finally{setBusy(false);setProgress('')}}
  return <Stack gap="xs"><Text fw={500}>{ft('Python (optional)')}</Text>
    <Text size="xs" c="dimmed">{ft('Download once, then run offline. The base runtime uses about 13 MB of storage; packages add more. Python uses more RAM than JavaScript. The interpreter is closed after each run.')}</Text>
    {error&&<Alert color="red">{ft(error)}</Alert>}
    <Text size="xs">{status?.ready?ft('Python ready on this device'):ft('Python is not installed')} · {((status?.bytes??0)/1048576).toFixed(1)} MB</Text>
    <MultiSelect label={ft('Optional Python packages')} searchable data={packages} value={selected} onChange={setSelected} disabled={busy} comboboxProps={{withinPortal:false}}/>
    <Text size="xs" c="dimmed">{ft('Packages come from the pinned Pyodide catalog. Downloads contact jsDelivr without sending chat files or API keys. Python code cannot download packages or access the network.')}</Text>
    <Group gap="xs"><Button size="xs" loading={busy} onClick={()=>void run(async()=>{const controller=new AbortController();abort.current=controller;await api.installPython(selected,controller.signal,setProgress)})}>{status?.ready?ft('Update Python packages'):ft('Download Python')}</Button>{busy?<Button size="xs" variant="default" onClick={()=>abort.current?.abort()}>{ft('Stop')}</Button>:<Button size="xs" variant="subtle" disabled={!status?.bytes} onClick={()=>void run(()=>api.clearPython())}>{ft('Remove Python runtime')}</Button>}</Group>
    {progress&&<Text size="xs">{progress}</Text>}
    <Checkbox label={ft('Enable Python tools for this chat')} checked={enabled} disabled={busy||!status?.ready} onChange={event=>{const value=event.currentTarget.checked;void run(()=>api.configurePython(sessionId,value))}}/>
  </Stack>
}
