import { Button, Stack, Switch, Text } from '@mantine/core'
import { navigateToSettings } from '@/modals/settings-navigation'
import { useProviderSettings } from '@/stores/settingsStore'
import { SettingRow, SettingsSection } from '@/components/settings/SettingsLayout'
export function VeniceMCPSettings() {
  const { providerSettings, setProviderSettings } = useProviderSettings('venice'); const options = providerSettings?.venice || {}
  const configured = !!providerSettings?.apiKey && options.enabled !== false
  return <SettingsSection title="Venice · MCP interno" description="Integrato nell’app, su Windows e Android. Nessun server da installare, porta da aprire o abbonamento Chatbox richiesto.">
    <SettingRow id="venice-internal-mcp" label="Strumenti Venice nelle chat in modalità Lavoro" description="Scelta e conferma del modello immagine, generazione e gestione dei media. I contenuti vengono inviati direttamente a Venice." control={<Switch aria-label="MCP interno Venice" checked={configured && options.chatToolsEnabled !== false} disabled={!configured} onChange={e => setProviderSettings({ venice: { ...options, chatToolsEnabled: e.currentTarget.checked } })} />} />
    <Stack gap="xs"><Text size="xs" c="dimmed">{configured ? 'Disponibile per i modelli Venice che supportano i tool. Abilita separatamente voce, video e musica nelle impostazioni Venice.' : 'Configura e abilita prima il provider Venice.'}</Text><Button size="xs" variant="subtle" onClick={() => navigateToSettings('/provider/venice')}>Impostazioni Venice</Button></Stack>
  </SettingsSection>
}
