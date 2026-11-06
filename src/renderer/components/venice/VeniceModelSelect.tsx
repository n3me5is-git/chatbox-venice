import { Group, Select, type SelectProps, Stack, Text } from '@mantine/core'
import type { MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
import { mediaCategory } from '@shared/providers/definitions/models/venice/media-capabilities'
import { forkT as ft } from '@/i18n/fork'
import { useTranslation } from 'react-i18next'
import { VeniceModelBadges } from './VeniceModelBadges'
import {useState} from 'react'
import {useOverlayManager} from '@/components/layout/Overlay'
export const categoryLabels:Record<string,string>={chat:'Chat',image:'Images','image-edit':'Image editing',embedding:'Embeddings',speech:'Voice',transcription:'Transcribe',video:'Video',music:'Music','sound-effects':'Sound effects','voice-conversion':'Voice conversion'}
export function VeniceModelOption({model}:{model:MediaCatalogItem}) {
  useTranslation()
  return <Stack gap={4} style={{minWidth:0,width:'100%'}}><Group gap="xs" wrap="wrap"><Text size="sm" fw={500} style={{overflowWrap:'anywhere'}}>{model.model_spec?.name||model.id}</Text><Text size="xs" c="dimmed">{ft(categoryLabels[mediaCategory(model)]||model.type)}</Text></Group><VeniceModelBadges metadata={model.model_spec}/></Stack>
}
export function VeniceModelSelect({models,...props}:Omit<SelectProps,'data'> & {models:MediaCatalogItem[]}) {
  useTranslation()
  const [opened,setOpened]=useState(false);useOverlayManager(opened,()=>setOpened(false))
  const grouped=Object.entries(categoryLabels).flatMap(([category,label])=>{const rows=models.filter(model=>mediaCategory(model)===category);return rows.length?[{group:ft(label),items:rows.map(model=>({value:model.id,label:model.model_spec?.name||model.id}))}]:[]})
  return <Select searchable allowDeselect={false} maxDropdownHeight={320} comboboxProps={{withinPortal:false}} {...props} dropdownOpened={opened} onDropdownOpen={()=>setOpened(true)} onDropdownClose={()=>setOpened(false)} data={grouped}
    filter={({options,search})=>options.map(option=>'group'in option?{...option,items:option.items.filter(item=>`${item.label} ${item.value}`.toLowerCase().includes(search.toLowerCase()))}:option)}
    renderOption={({option})=>{const model=models.find(item=>item.id===option.value);return model?<VeniceModelOption model={model}/>:option.label}}/>
}
