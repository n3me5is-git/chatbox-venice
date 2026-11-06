import { ActionIcon, Group, Stack, Switch, Text, UnstyledButton } from '@mantine/core'
import { IconSettings, IconWorldSearch } from '@tabler/icons-react'
import type { VeniceOptions } from '@shared/providers/definitions/models/venice/options'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'

export function VeniceSearchControl({settings,onEnabledChange,onOpen,disabled=false}:{settings:VeniceOptions;onEnabledChange:(enabled:boolean)=>void;onOpen:()=>void;disabled?:boolean}) {
  useTranslation()
  const configured=(settings.webSearch??'off')!=='off'
  const unavailable=settings.textPrivacy==='e2ee' && (settings.e2eeToolsEnabled!==true || (settings.searchProvider??'native')==='native' && settings.searchToolMode!=='separate')
  const enabled=configured && !unavailable && settings.webSearchEnabled!==false
  const subtitle=!configured?ft('Do not search'):unavailable?ft('Choose a client search tool for E2EE'):settings.webSearchEnabled===false?ft('Paused for this chat'):ft(settings.webSearch==='on'?'For every message':'When needed')+' · '+(settings.searchToolMode==='separate'?'Brave / Google / Exa':settings.searchProvider==='native'||!settings.searchProvider?'Venice':settings.searchProvider)
  return <Group gap="xs" wrap="nowrap" p="sm">
    <IconWorldSearch size={17} opacity={enabled?1:0.5}/>
    <UnstyledButton onClick={onOpen} style={{flex:1,minWidth:0}}><Stack gap={1}><Text size="sm">{ft('Venice model search')}</Text><Text size="xs" c="dimmed">{subtitle}</Text></Stack></UnstyledButton>
    <Switch size="xs" aria-label={ft('Enable Venice search for this chat')} checked={enabled} disabled={disabled||!configured||unavailable} onChange={event=>onEnabledChange(event.currentTarget.checked)}/>
    <ActionIcon size="sm" variant="subtle" aria-label={ft('Venice search settings')} onClick={onOpen}><IconSettings size={16}/></ActionIcon>
  </Group>
}
