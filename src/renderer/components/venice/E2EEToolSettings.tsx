import { VeniceSettingSelect as Select } from '@/components/venice/VeniceSettingSelect'
import { Alert, Button, Group, Stack, Switch, Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { forkT as ft } from '@/i18n/fork'

type ToolMode='encrypted-text'|'native'
export function E2EEToolSettings({enabled,mode='encrypted-text',onChange}:{enabled:boolean;mode?:ToolMode;onChange:(enabled:boolean,mode:ToolMode)=>void}) {
  useTranslation();const [opened,setOpened]=useState(false),[pending,setPending]=useState<ToolMode>(mode)
  const data=[{value:'encrypted-text',label:ft('Encrypted tool messages')},{value:'native',label:ft('Native tools with visible metadata')}]
  return <Stack gap="xs"><Switch aria-label={ft('Tools in encrypted chat')} label={ft('Tools in encrypted chat')} description={ft('Search and MCP tools with explicit privacy controls.')} checked={enabled} onChange={event=>{if(event.currentTarget.checked){setPending(mode);setOpened(true)}else onChange(false,mode)}}/>
    {enabled&&<Select comboboxProps={{withinPortal:false}} label={ft('Tool transport')} data={data} value={mode} allowDeselect={false} onChange={value=>{if(value){setPending(value as ToolMode);setOpened(true)}}}/>}
    <AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title={ft('Allow tools in encrypted chat?')}><Stack>
      <Select comboboxProps={{withinPortal:false}} label={ft('Tool transport')} data={data} value={pending} allowDeselect={false} onChange={value=>value&&setPending(value as ToolMode)}/>
      {pending==='encrypted-text'?<Text>{ft('Tool definitions, calls and results travel inside encrypted text. The app reconstructs calls after decryption and signature verification. This uses the venice-e2ee text protocol; models must follow its tool instructions.')}</Text>:<Alert color="orange">{ft('Native function calling requires supportsFunctionCalling in the model catalog. Tool definitions and current function-call arguments/results are outside E2EE and may be visible to Venice. Text prompts and text replies remain encrypted. Calls follow the selected secure receipt verification policy.')}</Alert>}
      <Alert color="yellow">{ft('Search services and MCP servers receive the arguments needed to execute their tools. Those services are outside the encrypted model conversation. Only enable tools you trust.')}</Alert>
      <Text size="sm">{ft('Normal tool permissions and generation approvals still apply. Native Venice search and multimodal input remain unavailable. No failed request is retried automatically in a different privacy mode.')}</Text>
      <Group justify="end"><Button variant="default" onClick={()=>setOpened(false)}>{ft('Cancel')}</Button><Button onClick={()=>{onChange(true,pending);setOpened(false)}}>{ft('Enable tools')}</Button></Group>
    </Stack></AdaptiveModal>
  </Stack>
}
