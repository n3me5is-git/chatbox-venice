import NiceModal from '@ebay/nice-modal-react'
import { Badge, Button, Divider, Group, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalMCPChatShare } from '@shared/local-mcp'
import { forkT as ft } from '@/i18n/fork'
import { isTemporaryChat, isUnavailableChat, useRetainedChat } from '@/packages/chat-retention/retention'
import platform from '@/platform'

export function openChatMCPShare(sessionId: string) {
  if (isTemporaryChat(sessionId) || isUnavailableChat(sessionId)) return
  void import('./ChatMCPShareDialog').then(({ ChatMCPShareDialog }) => NiceModal.show(ChatMCPShareDialog, { sessionId }))
}

export function ChatMCPShareControl({ sessionId, onOpen }: { sessionId: string; onOpen: () => void }) {
  useTranslation()
  useRetainedChat(sessionId)
  const available = platform.type === 'desktop' && sessionId !== 'new' && !isTemporaryChat(sessionId) && !isUnavailableChat(sessionId)
  const [port, setPort] = useState<number>()
  useEffect(() => {
    const ipc = window.electronAPI
    if (!available || !ipc) return
    let active = true
    const refresh = () => {
      void (ipc.invoke('local-mcp:control', 'list-shares') as Promise<LocalMCPChatShare[]>).then(shares => {
        if (active) setPort(shares.find(share => share.sessionId === sessionId)?.port)
      }).catch(() => { if (active) setPort(undefined) })
    }
    setPort(undefined)
    refresh()
    window.addEventListener('local-mcp:state-changed', refresh)
    return () => { active = false; window.removeEventListener('local-mcp:state-changed', refresh) }
  }, [available, sessionId])

  if (!available) return null
  return (
    <Stack gap="xs" px="sm" py="xs">
      <Divider />
      <Group justify="space-between" gap="xs">
        <Text size="sm" fw={600}>{ft('Share this chat through MCP')}</Text>
        <Badge variant="light" color={port ? 'green' : 'gray'}>{port ? ft('Active on port {{port}}', { port }) : ft('Not shared')}</Badge>
      </Group>
      <Button size="compact-sm" variant="light" onClick={() => { onOpen(); openChatMCPShare(sessionId) }}>{ft('Manage chat sharing')}</Button>
    </Stack>
  )
}
