import { ActionIcon, Group, Stack, Text } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CHATGPT_SUB_PROVIDER } from '@shared/oauth/chatgpt-subscription'
import type { ChatGPTAllowance as Allowance, AllowanceWindow } from '@shared/oauth/chatgpt-allowance'
import { subscriptionAllowance } from '@/packages/chatgpt-subscription/service'
import { useProviderSettings } from '@/stores/settingsStore'
import { forkT as ft } from '@/i18n/fork'

export function ChatGPTAllowance({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation(), { providerSettings } = useProviderSettings(CHATGPT_SUB_PROVIDER)
  const connected = !!providerSettings?.oauth, [data, setData] = useState<Allowance>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const controller = useRef<AbortController>()
  const refresh = useCallback(async () => {
    controller.current?.abort()
    if (!connected || document.visibilityState === 'hidden') return
    const next = new AbortController(); controller.current = next; setBusy(true)
    try { const result = await subscriptionAllowance(next.signal); if (!next.signal.aborted) { setData(result); setError('') } }
    catch (reason) { if (!next.signal.aborted) { setData(undefined); setError(reason instanceof Error ? reason.message : 'ChatGPT allowance unavailable') } }
    finally { if (controller.current === next) setBusy(false) }
  }, [connected])
  useEffect(() => {
    setData(undefined); setError(''); void refresh()
    const focus = () => void refresh(), lock = () => { controller.current?.abort(); setData(undefined); setError(''); setBusy(false) }
    const timer = setInterval(focus, 120000)
    window.addEventListener('focus', focus); window.addEventListener('chatbox:privacy-lock', lock); document.addEventListener('visibilitychange', focus)
    return () => { clearInterval(timer); controller.current?.abort(); window.removeEventListener('focus', focus); window.removeEventListener('chatbox:privacy-lock', lock); document.removeEventListener('visibilitychange', focus) }
  }, [refresh])
  if (!connected) return null
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const label = (item: AllowanceWindow) => item.period === 'monthly' ? ft('Monthly allowance') : item.period === 'weekly' ? ft('Weekly allowance') : item.period === 'account' ? ft('Account spending allowance') : item.period === 'hours' ? ft('{{count}}-hour allowance', { count: (item.duration || 0) / 3600 }) : ft('{{count}}-day allowance', { count: (item.duration || 0) / 86400 })
  return <Group gap="xs" wrap="nowrap" align="start" aria-label={ft('ChatGPT allowance')}>
    <Stack gap={2} miw={0}>
      {!compact && <Text size="sm" fw={500}>ChatGPT{data?.plan ? ' · ' + data.plan : ''}</Text>}
      {data ? <>
        {!data.windows.some(item => item.period === 'monthly') && <Text size="xs" c="dimmed">{ft('Monthly allowance')}: {ft('Not reported by this account')}</Text>}
        {data.windows.map(item => <Text key={item.id} size="xs" c="dimmed" title={item.resetsAt ? ft('Resets {{date}}', { date: new Date(item.resetsAt).toLocaleString(locale) }) : undefined} style={{ overflowWrap: 'anywhere' }}>
          {item.group !== 'ChatGPT' ? item.group + ' · ' : compact ? 'ChatGPT · ' : ''}{label(item)}: {ft('{{percent}}% remaining', { percent: item.remaining.toLocaleString(locale, { maximumFractionDigits: 1 }) })}{!compact && item.resetsAt ? ' · ' + ft('Resets {{date}}', { date: new Date(item.resetsAt).toLocaleString(locale) }) : ''}
        </Text>)}
      </> : <Text size="xs" c="dimmed" title={error}>{ft(error ? 'ChatGPT allowance unavailable' : 'Loading ChatGPT allowance…')}</Text>}
    </Stack>
    <ActionIcon size="sm" variant="subtle" aria-label={ft('Refresh ChatGPT allowance')} loading={busy} onClick={() => void refresh()}><IconRefresh size={14} /></ActionIcon>
  </Group>
}
