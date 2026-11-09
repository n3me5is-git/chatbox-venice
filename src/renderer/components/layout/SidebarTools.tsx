import { Flex, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconTools } from '@tabler/icons-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { useUIStore } from '@/stores/uiStore'

export function SidebarTools({ children }: { children: ReactNode }) {
  useTranslation()
  const id = useId()
  const collapsed = useUIStore((state) => state.sidebarToolsCollapsed)
  const setCollapsed = useUIStore((state) => state.setSidebarToolsCollapsed)
  const Chevron = collapsed ? IconChevronRight : IconChevronDown

  return (
    <Stack gap={2}>
      <UnstyledButton
        w="100%"
        px="sm"
        py={8}
        aria-label={ft(collapsed ? 'Expand tools' : 'Collapse tools')}
        aria-expanded={!collapsed}
        aria-controls={id}
        onClick={() => setCollapsed(!collapsed)}
        className="rounded-md hover:bg-chatbox-background-secondary-hover"
      >
        <Flex align="center" gap="xs">
          <IconTools size={18} aria-hidden />
          <Text size="sm" fw={500} flex={1}>{ft('Tools')}</Text>
          <Chevron size={16} aria-hidden />
        </Flex>
      </UnstyledButton>
      <div id={id} hidden={collapsed} style={{ display: collapsed ? 'none' : undefined }}>
        <Stack gap={2}>{children}</Stack>
      </div>
    </Stack>
  )
}
