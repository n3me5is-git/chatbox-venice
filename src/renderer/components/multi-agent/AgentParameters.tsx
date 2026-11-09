import { Group, NumberInput, Select, Stack, Text } from '@mantine/core'
import { SessionSettingsSchema, type SessionSettings } from '@shared/types'
import type { AgentModel } from '@shared/multi-agent'
import { getReasoningProviderOptions, resolveReasoningProviderOptions, setReasoningProviderOptionsForModel } from '@shared/utils/reasoning-control'
import { useProviders } from '@/hooks/useProviders'
import ReasoningControlButton from '@/components/InputBox/ReasoningControlButton'
import { VeniceSessionPrivacySettings } from '@/components/venice/VeniceSessionPrivacySettings'
import { forkT as ft } from '@/i18n/fork'
import { ContextTokenBudgetField } from '@/components/common/ContextTokenBudgetField'
export function AgentParameters({ model, value, onChange, allowCompaction = true }: { model: AgentModel; value?: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void; allowCompaction?: boolean }) {
  const { providers } = useProviders(), info = providers.find(provider => provider.id === model.provider)?.models?.find(row => row.modelId === model.modelId)
  const settings = SessionSettingsSchema.parse(value || {}), options = resolveReasoningProviderOptions(settings, model.provider, model.modelId)
  const patch = (next: Partial<SessionSettings>) => onChange({ ...settings, ...next })
  return <Stack gap="xs"><Group><Text size="sm">{ft('Thinking level')}</Text><ReasoningControlButton provider={model.provider} model={info} providerOptions={options} iconSize={18} onChange={level => patch(setReasoningProviderOptionsForModel(settings, model.provider, model.modelId, getReasoningProviderOptions(model.provider, info, level, options)))}/></Group>
    <NumberInput label={ft('Maximum output tokens (optional)')} min={1} value={settings.maxTokens || ''} onChange={value => patch({ maxTokens: typeof value === 'number' ? value : undefined })}/>
    <NumberInput label={ft('Temperature (optional)')} min={0} max={2} step={0.1} value={settings.temperature ?? ''} onChange={value => patch({ temperature: typeof value === 'number' ? value : undefined })}/>
    <ContextTokenBudgetField label={ft('Agent context budget (tokens)')} value={settings.contextTokenLimit} placeholder={ft('Use global context budget')} onApply={contextTokenLimit => patch({contextTokenLimit})}/>
    {allowCompaction && <Select label={ft('Auto Compaction')} comboboxProps={{withinPortal:false}} allowDeselect={false} value={settings.autoCompaction === undefined ? 'default' : settings.autoCompaction ? 'on' : 'off'} data={[{value:'default',label:ft('Use global context settings')},{value:'on',label:ft('On')},{value:'off',label:ft('Off')}]} onChange={value=>patch({autoCompaction:value==='default'?undefined:value==='on'})}/>}
    {model.provider === 'venice' && <VeniceSessionPrivacySettings settings={{ ...settings, ...model }} onChange={veniceSecurity => patch({ veniceSecurity })}/>}
  </Stack>
}
