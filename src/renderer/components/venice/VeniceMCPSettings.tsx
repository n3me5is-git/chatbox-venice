import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { Button, Stack, Switch, Text } from '@mantine/core'
import { navigateToSettings } from '@/modals/settings-navigation'
import { useProviderSettings } from '@/stores/settingsStore'
import { SettingRow, SettingsSection } from '@/components/settings/SettingsLayout'
export function VeniceMCPSettings() {
  useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings('venice'); const options = providerSettings?.venice || {}
  const configured = !!providerSettings?.apiKey && options.enabled !== false
  return <SettingsSection title={ft("Venice · internal MCP")} description={ft("Built into the app on Windows and Android. No server installation, open port or Chatbox subscription required.")}>
    <SettingRow id="venice-internal-mcp" label={ft("Venice tools in Work mode chats")} description={ft("Choose and approve an image model, generate and manage media. Content is sent directly to Venice.")} control={<Switch aria-label={ft("Internal Venice MCP")} checked={configured && options.chatToolsEnabled !== false} disabled={!configured} onChange={e => setProviderSettings({ venice: { ...options, chatToolsEnabled: e.currentTarget.checked } })} />} />
    <Stack gap="xs"><Text size="xs" c="dimmed">{configured ? ft("Available for Venice models with tool support. Enable voice, video and music separately in Venice settings.") : ft("Configure and enable the Venice provider first.")}</Text><Button size="xs" variant="subtle" onClick={() => navigateToSettings('/provider/venice')}>{ft("Venice settings")}</Button></Stack>
  </SettingsSection>
}
