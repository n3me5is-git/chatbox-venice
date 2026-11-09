import { Select, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { SessionSettings } from '@shared/types'
import { forkT as ft } from '@/i18n/fork'
export function SubscriptionSessionSearch({ settings, onChange }: { settings: SessionSettings; onChange: (value: boolean | undefined) => void }) {
  useTranslation()
  return <Stack gap="xs"><Select comboboxProps={{ withinPortal: false }} allowDeselect={false} label={ft('ChatGPT native web search')} value={settings.subscriptionWebSearch === undefined ? 'default' : settings.subscriptionWebSearch ? 'on' : 'off'} data={[{value:'default',label:ft('Use provider default')},{value:'on',label:ft('On')},{value:'off',label:ft('Off')}]} onChange={value => onChange(value === 'default' ? undefined : value === 'on')} /><Text size="xs" c="dimmed">{ft('This controls the ChatGPT built-in search tool. It does not change Chatbox web search or MCP tools.')}</Text></Stack>
}
