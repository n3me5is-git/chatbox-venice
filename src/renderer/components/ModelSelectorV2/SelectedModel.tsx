import { ActionIcon, Badge, Group, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '../common/AdaptiveModal'
import { VeniceModelDetails } from '../venice/VeniceModelInfo'
import { VeniceModelBadges } from '../venice/VeniceModelBadges'
import { VeniceModelCost } from '../venice/VeniceModelCost'
import { DetailCard } from './DetailCard'
import type { DetailModel } from './types'
import { forkT as ft } from '@/i18n/fork'

/** Pinned inside the picker, never an additional mobile composer control. */
export function SelectedModel({model,onDetails}:{model:DetailModel;onDetails:()=>void}) {
  useTranslation()
  return <Group data-selected-model p="xs" wrap="nowrap" gap="sm" style={{flexShrink:0,borderBottom:'1px solid var(--chatbox-border-primary)',background:'var(--chatbox-background-brand-secondary)'}}>
    <Stack gap={3} style={{flex:1,minWidth:0}}>
      <Group gap="xs"><Badge variant="light" size="xs">{ft('Currently selected')}</Badge><Text size="xs" c="dimmed">{model.providerName}</Text></Group>
      <Text size="sm" fw={600} style={{overflowWrap:'anywhere',whiteSpace:'normal'}}>{model.name}</Text>
      <Group gap={4}><VeniceModelBadges metadata={model.vendorMetadata} compact/>{model.providerId==='venice'&&<VeniceModelCost metadata={model.vendorMetadata} type="text"/>}</Group>
    </Stack>
    <ActionIcon size="lg" variant="subtle" aria-label={ft('Selected model details')} onClick={event=>{event.stopPropagation();onDetails()}}><IconInfoCircle size={20}/></ActionIcon>
  </Group>
}

export function SelectedModelDetails({model,onClose}:{model:DetailModel|null;onClose:()=>void}) {
  useTranslation()
  const venice=model?.providerId==='venice'
  const entry=model?{id:model.modelId,type:String(model.vendorMetadata?.veniceType||'text'),model_spec:{...model.vendorMetadata,name:model.name,description:model.description}}:undefined
  return <AdaptiveModal opened={!!model} onClose={onClose} title={model?.name||ft('Selected model details')} size={venice?'lg':'md'}>
    {venice?<VeniceModelDetails model={entry} onClose={onClose} inline/>:model&&<DetailCard model={model} onClose={onClose} mobile/>}
  </AdaptiveModal>
}
