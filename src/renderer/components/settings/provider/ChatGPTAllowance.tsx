import { ActionIcon, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CHATGPT_SUB_PROVIDER } from '@shared/oauth/chatgpt-subscription'
import type { ChatGPTAllowance as Allowance, AllowanceWindow } from '@shared/oauth/chatgpt-allowance'
import { subscriptionAllowance } from '@/packages/chatgpt-subscription/service'
import { useProviderSettings } from '@/stores/settingsStore'
import { forkT as ft } from '@/i18n/fork'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'

export function ChatGPTAllowance({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation(), { providerSettings } = useProviderSettings(CHATGPT_SUB_PROVIDER)
  const connected = !!providerSettings?.oauth, [data, setData] = useState<Allowance>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [details, setDetails] = useState(false)
  const controller = useRef<AbortController>()
  const refresh = useCallback(async () => {
    controller.current?.abort()
    if (!connected || document.visibilityState === 'hidden') return
    const next = new AbortController(); controller.current = next; setBusy(true)
    try { const result = await subscriptionAllowance(next.signal); if (!next.signal.aborted) { setData(result); setError('') } }
    catch (reason) { if (!next.signal.aborted) { setData(undefined); setDetails(false); setError(reason instanceof Error ? reason.message : 'ChatGPT allowance unavailable') } }
    finally { if (controller.current === next) setBusy(false) }
  }, [connected])
  useEffect(() => {
    setData(undefined); setDetails(false); setError(''); void refresh()
    const focus = () => void refresh(), lock = () => { controller.current?.abort(); setData(undefined); setDetails(false); setError(''); setBusy(false) }
    const timer = setInterval(focus, 120000)
    const reconnected = () => { lock(); void refresh() }
    window.addEventListener('focus', focus); window.addEventListener('chatbox:privacy-lock', lock); window.addEventListener('chatbox:subscription-connected', reconnected); document.addEventListener('visibilitychange', focus)
    return () => { clearInterval(timer); controller.current?.abort(); window.removeEventListener('focus', focus); window.removeEventListener('chatbox:privacy-lock', lock); window.removeEventListener('chatbox:subscription-connected', reconnected); document.removeEventListener('visibilitychange', focus) }
  }, [refresh])
  if (!connected) return null
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const label = (item: AllowanceWindow) => item.period === 'monthly' ? ft('Monthly allowance') : item.period === 'weekly' ? ft('Weekly allowance') : item.period === 'account' ? ft('Account spending allowance') : item.period === 'hours' ? ft('{{count}}-hour allowance', { count: (item.duration || 0) / 3600 }) : ft('{{count}}-day allowance', { count: (item.duration || 0) / 86400 })
  const rows = (expanded: boolean) => data?.windows.map(item => <Stack key={item.id} gap={2}>
    <Text size={expanded ? 'sm' : 'xs'} c={expanded ? undefined : 'dimmed'} style={{ overflowWrap: 'anywhere' }}>
      {item.group !== 'ChatGPT' ? item.group + ' · ' : compact && !expanded ? 'ChatGPT · ' : ''}{label(item)}: {ft('{{percent}}% remaining', { percent: item.remaining.toLocaleString(locale, { maximumFractionDigits: 1 }) })}
    </Text>
    {expanded && <Text size="xs" c="dimmed">{item.resetsAt ? ft('Resets {{date}}', { date: new Date(item.resetsAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) }) : ft('Reset date not reported')}</Text>}
  </Stack>)
  return <><Group gap="xs" wrap="nowrap" align="start" aria-label={ft('ChatGPT allowance')}>
    <UnstyledButton aria-label={ft('View ChatGPT allowance details')} disabled={!data} onClick={() => setDetails(true)} style={{ minWidth: 0 }}>
    <Group gap={6} wrap="nowrap" align="start">
    <Stack gap={2} miw={0}>
      {!compact && <Text size="sm" fw={500}>ChatGPT{data?.plan ? ' · ' + data.plan : ''}</Text>}
      {data ? rows(false) : <Text size="xs" c="dimmed" title={error}>{ft(error ? 'ChatGPT allowance unavailable' : 'Loading ChatGPT allowance…')}</Text>}
    </Stack>
    {!!data && <IconInfoCircle size={14} style={{ flexShrink: 0, marginTop: 2, opacity: 0.65 }} />}
    </Group>
    </UnstyledButton>
    <ActionIcon size="sm" variant="subtle" aria-label={ft('Refresh ChatGPT allowance')} loading={busy} onClick={() => void refresh()}><IconRefresh size={14} /></ActionIcon>
  </Group>
  <AdaptiveModal opened={details && !!data} onClose={() => setDetails(false)} title={ft('ChatGPT allowance details')} size="sm"><Stack gap="md">
    {data?.plan && <Text fw={500}>ChatGPT · {data.plan}</Text>}{rows(true)}<Text size="xs" c="dimmed">{ft('Reset dates use this device’s time zone. Allowances are shared across your account.')}</Text>
  </Stack></AdaptiveModal></>
}
