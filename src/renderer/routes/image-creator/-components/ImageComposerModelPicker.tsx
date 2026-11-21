import { ActionIcon, Group, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconSparkles } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageModelSelect } from '@/components/ImageModelSelect'
import type { ImageModelGroup } from '@/hooks/useImageModelGroups'
import { useIsSmallScreen } from '@/hooks/useScreenChange'
import { forkT as ft } from '@/i18n/fork'
import { MobileModelDrawer } from './MobileDrawers'
import type { ImageModelSelection } from './model-selection'

export function ImageComposerModelPicker({ groups, selection, onSelect }: {
  groups: ImageModelGroup[]
  selection: ImageModelSelection | null
  onSelect: (provider: string, model: string) => void
}) {
  useTranslation()
  const mobile = useIsSmallScreen()
  const [opened, setOpened] = useState(false)
  const model = groups.find(group => group.providerId === selection?.provider)?.models.find(option => option.modelId === selection?.model)
  const label = model?.displayName ?? ft('Choose a model')
  const content = <Group component="span" wrap="nowrap" gap={4} px={8} mih={36} c="dimmed">
    <IconSparkles size={16} />
    <Text component="span" size="sm" truncate maw={mobile ? 140 : 220} title={label}>{label}</Text>
    <IconChevronDown size={14} />
  </Group>

  return mobile ? <>
    <UnstyledButton aria-label={ft('Image model')} onClick={() => setOpened(true)}>{content}</UnstyledButton>
    <MobileModelDrawer open={opened} onOpenChange={setOpened} modelGroups={groups} selectedProvider={selection?.provider ?? ''} selectedModel={selection?.model ?? ''} onSelect={onSelect} />
  </> : <ImageModelSelect modelGroups={groups} onSelect={onSelect} triggerLabel={ft('Image model')}>{content}</ImageModelSelect>
}
