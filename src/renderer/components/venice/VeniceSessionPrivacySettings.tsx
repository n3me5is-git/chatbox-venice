import type { SessionSettings } from '@shared/types'
import { useProviders } from '@/hooks/useProviders'
import { useSettingsStore } from '@/stores/settingsStore'
import { VeniceChatPrivacySettings } from './VeniceChatPrivacySettings'

export function VeniceSessionPrivacySettings({ settings, onChange }: {
  settings: SessionSettings
  onChange: (value: SessionSettings['veniceSecurity']) => void
}) {
  const provider = useSettingsStore(state => state.providers?.venice?.venice)
  const { providers } = useProviders()
  const model = providers.find(item => item.id === 'venice')?.models?.find(item => item.modelId === settings.modelId)
  return <VeniceChatPrivacySettings key={settings.modelId} provider={provider || {}} model={model}
    value={settings.veniceSecurity} onChange={onChange} />
}
