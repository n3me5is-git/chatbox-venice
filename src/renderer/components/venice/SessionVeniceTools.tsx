import { Alert,Stack,Switch,Text } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { veniceToolsEnabled,veniceToolsVisible } from '@shared/providers/definitions/models/venice/tool-policy'
import { rendererApplication } from '@/app/renderer-application'
import { useSessionPresentation } from '@/hooks/useSessionPresentation'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { forkT as ft } from '@/i18n/fork'
export function SessionVeniceTools({sessionId,providerId,disabled=false}:{sessionId:string;providerId?:string;disabled?:boolean}){
  useTranslation();const configured=useSettingsStore(state=>state.providers?.venice),draft=useUIStore(state=>state.newSessionState.veniceToolsEnabled),setDraft=useUIStore(state=>state.setNewSessionState),{header}=useSessionPresentation(sessionId==='new'?null:sessionId),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  if(!configured?.apiKey||!veniceToolsVisible(providerId,configured.venice))return null
  const value=sessionId==='new'?draft:header?.settings?.veniceToolsEnabled,options=configured.venice||{}
  const save=async(enabled:boolean)=>{setSaving(true);setError('');try{if(sessionId==='new')setDraft(current=>({...current,veniceToolsEnabled:enabled}));else await rendererApplication.sessions.updateSessionHeader(sessionId,current=>{if(!current)throw Error('This chat is no longer available');return {...current,settings:{...current.settings,veniceToolsEnabled:enabled}}})}catch{setError(ft('Failed to save settings'))}finally{setSaving(false)}}
  return <Stack gap={4} p="sm"><Switch label={ft('Venice tools for this chat')} checked={veniceToolsEnabled(providerId,value,options)} disabled={disabled||saving||options.enabled===false||options.chatToolsEnabled===false} onChange={event=>void save(event.currentTarget.checked)}/><Text size="xs" c="dimmed">{ft('Images, audio and video use Venice when this switch is on. This does not change the chat model or its search settings.')}</Text>{error&&<Alert color="red">{error}</Alert>}</Stack>
}
