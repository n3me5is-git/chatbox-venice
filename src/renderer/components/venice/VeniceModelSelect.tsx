import { ActionIcon, Box, Group, Select, type SelectProps, Stack, Text, TextInput, UnstyledButton } from '@mantine/core'
import type { MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
import { mediaCategory, mediaCategories } from '@shared/providers/definitions/models/venice/media-capabilities'
import { videoVariant } from '@shared/providers/definitions/models/venice/model-variant'
import { IconInfoCircle, IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { useOverlayManager } from '@/components/layout/Overlay'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { forkT as ft } from '@/i18n/fork'
import { VeniceModelBadges } from './VeniceModelBadges'
import { VeniceModelCost } from './VeniceModelCost'
import { VeniceModelDetails } from './VeniceModelInfo'
import { categoryLabels } from './model-labels'
export { categoryLabels } from './model-labels'

export function VeniceModelOption({ model }: { model: MediaCatalogItem }) {
  useTranslation()
  const variant = videoVariant(model)
  return <Stack gap={4} style={{ minWidth: 0, width: '100%' }}>
    <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>{model.model_spec?.name || model.id}</Text>
    <Text size="xs" c="dimmed">{variant ? ft(variant) : mediaCategories(model).map(category => ft(categoryLabels[category] || category)).join(' · ')}</Text>
    <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{model.id}</Text>
    <Group gap="xs"><VeniceModelBadges metadata={{...model.model_spec,veniceType:model.type}} showUnknown /><VeniceModelCost model={model} /></Group>
  </Stack>
}

export function VeniceModelSelect({ models, ...props }: Omit<SelectProps, 'data'> & { models: MediaCatalogItem[] }) {
  const { t } = useTranslation()
  const mobile = useIsSmallScreen()
  const [opened, setOpened] = useState(false)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<MediaCatalogItem>()
  useOverlayManager(opened && !mobile, () => setOpened(false))
  const groups = Object.entries(categoryLabels).flatMap(([category, label]) => {
    const rows = models.filter(model => mediaCategory(model) === category)
    return rows.length ? [{ group: ft(label), items: rows.map(model => {
      const name = model.model_spec?.name || model.id
      const repeated = models.filter(row => (row.model_spec?.name || row.id) === name).length > 1
      const variant = videoVariant(model)
      return { value: model.id, label: repeated ? `${name} · ${variant ? ft(variant) : model.id}` : name }
    }) }] : []
  })
  const matches = (id: string, label: string, query: string) => {
    const variant = videoVariant(models.find(model => model.id === id))
    return `${label} ${id} ${variant ? ft(variant) : ''}`.toLowerCase().includes(query.trim().toLowerCase())
  }
  const close = () => { setOpened(false); props.onDropdownClose?.() }
  const info = (model: MediaCatalogItem) => <ActionIcon
    aria-label={`${t('Model details')}: ${model.model_spec?.name || model.id}`}
    title={ft('Model details and options')} variant="subtle" size={mobile ? 'lg' : 'md'}
    style={{ flexShrink: 0 }} data-mantine-stop-propagation
    onMouseDown={event => event.preventDefault()} onPointerDown={event => event.stopPropagation()}
    onKeyDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); if (!mobile) close(); setDetail(model) }}
  ><IconInfoCircle size={19} /></ActionIcon>

  return <>
    <Select allowDeselect={false} maxDropdownHeight={320}
      {...props} searchable={mobile ? false : props.searchable ?? true} comboboxProps={{ ...props.comboboxProps, withinPortal: false, keepMounted: false }} withScrollArea={false}
      styles={{ options: { maxHeight: `min(${props.maxDropdownHeight || 320}px, 50dvh)`, overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } }}
      dropdownOpened={!mobile && opened}
      onDropdownOpen={() => { setSearch(''); setOpened(true); props.onDropdownOpen?.() }} onDropdownClose={mobile ? undefined : close}
      data={groups}
      filter={({ options, search }) => options.map(option => 'group' in option ? { ...option, items: option.items.filter(item => matches(item.value, item.label, search)) } : option)}
      renderOption={({ option }) => {
        const model = models.find(item => item.id === option.value)
        return model ? <Group wrap="nowrap" w="100%"><VeniceModelOption model={model} />{info(model)}</Group> : option.label
      }}
    />
    {mobile && <AdaptiveModal opened={opened} onClose={close} title={ft('Choose a model')} size="lg">
      <Stack gap="sm">
        <TextInput label={t('Search')} leftSection={<IconSearch size={16} />} value={search} onChange={event => setSearch(event.currentTarget.value)} />
        <Box role="listbox" aria-label={ft('Choose a model')} data-model-scroll="venice"
          style={{ maxHeight: '52dvh', overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }} data-vaul-no-drag>
          {groups.map(group => <Box key={group.group}>
            <Text size="xs" fw={600} c="dimmed" px="sm" py="xs">{group.group}</Text>
            {group.items.filter(item => matches(item.value, item.label, search)).map(item => {
              const model = models.find(row => row.id === item.value)!
              return <Group key={model.id} role="option" data-model-id={model.id} aria-selected={props.value === model.id} wrap="nowrap" gap="xs" pr={4}
                onClick={() => { props.onChange?.(model.id, item); close() }}
                style={{ borderRadius: 8, background: props.value === model.id ? 'var(--mantine-color-blue-light)' : undefined }}>
                <UnstyledButton type="button" p="sm" style={{ flex: 1, minWidth: 0 }}>
                  <VeniceModelOption model={model} />
                </UnstyledButton>{info(model)}
              </Group>
            })}
          </Box>)}
          {!models.some(model => matches(model.id, model.model_spec?.name || model.id, search)) && <Text p="sm" c="dimmed">{t('No models available')}</Text>}
        </Box>
      </Stack>
    </AdaptiveModal>}
    <VeniceModelDetails key={detail?.id} model={detail} onClose={() => setDetail(undefined)} />
  </>
}
