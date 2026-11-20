import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalMCPChatShare } from '@shared/local-mcp'
import { rendererApplication } from '@/app/renderer-application'
import { forkT as ft } from '@/i18n/fork'
import { disableMCPStartup, localMCPChanged } from '@/packages/local-mcp/profiles'

export function ActiveChatMCPShares() {
  useTranslation()
  const [shares, setShares] = useState<(LocalMCPChatShare & { name?: string })[]>([])
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let revision = 0
    const refresh = async () => {
      const generation = ++revision
      try {
        const running: LocalMCPChatShare[] = await window.electronAPI.invoke('local-mcp:control', 'list-shares')
        const next = await Promise.all(running.map(async share => ({
          ...share,
          name: (await rendererApplication.sessions.repository.meta.getById(share.sessionId).catch(() => null))?.name,
        })))
        if (active && generation === revision) setShares(next)
      } catch { if (active && generation === revision) setError(true) }
    }
    void refresh()
    window.addEventListener('local-mcp:state-changed', refresh)
    return () => { active = false; window.removeEventListener('local-mcp:state-changed', refresh) }
  }, [])

  async function stop(sessionId?: string) {
    setStopping(true)
    setError(false)
    try {
      if (sessionId) {
        await disableMCPStartup('chat:'+sessionId).finally(() => window.electronAPI.invoke('local-mcp:control', 'stop-chat', sessionId))
      } else {
        await disableMCPStartup('shares').finally(() => window.electronAPI.invoke('local-mcp:control', 'stop-shares'))
      }
    } catch { setError(true) }
    finally { setStopping(false); localMCPChanged() }
  }

  return (
    <Stack gap="xs">
      <Text fw={600}>{ft('Active chat shares')}</Text>
      {error && <Alert color="red">{ft('Could not update chat sharing. Please try again.')}</Alert>}
      {shares.length === 0 && <Text size="sm" c="dimmed">{ft('No chats are shared through MCP.')}</Text>}
      {shares.map(share => (
        <Group key={share.sessionId} justify="space-between" gap="xs">
          <Stack gap={0} miw={0}>
            <Text size="sm" lineClamp={2}>{share.name || ft('Shared chat')}</Text>
            <Text size="xs" c="dimmed">{ft('Active on port {{port}}', { port: share.port })}</Text>
          </Stack>
          <Button size="compact-sm" variant="subtle" color="red" disabled={stopping} onClick={() => void stop(share.sessionId)}>{ft('Stop sharing')}</Button>
        </Group>
      ))}
      {shares.length > 0 && <Button size="compact-sm" variant="light" color="red" loading={stopping} onClick={() => void stop()}>{ft('Stop all chat shares')}</Button>}
    </Stack>
  )
}
