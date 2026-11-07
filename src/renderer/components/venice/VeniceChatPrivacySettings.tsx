import { Alert, Badge, Button, Group, Stack, Switch, Text } from '@mantine/core'
import type { ProviderModelInfo } from '@shared/types'
import type { VeniceChatSecurity } from '@shared/types/settings'
import { resolveVeniceSettings, type VeniceOptions } from '@shared/providers/definitions/models/venice/options'
import { effectiveTextPrivacy, supportsTee } from '@shared/providers/definitions/models/venice/privacy'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { forkT as ft } from '@/i18n/fork'
import { E2EEToolSettings } from './E2EEToolSettings'
import { SecureReceiptSettings } from './SecureReceiptSettings'
import { VeniceSettingSelect } from './VeniceSettingSelect'

type Props = {
  provider: VeniceOptions
  value?: VeniceChatSecurity
  model?: ProviderModelInfo
  onChange: (value: VeniceChatSecurity | undefined) => void
}

const labels = {
  standard: 'Standard HTTPS',
  tee: 'Require TEE verification',
  e2ee: 'Require end-to-end encryption',
} as const
const rank = { standard: 0, tee: 1, e2ee: 2 }

/** A separate user-owned setting: search/model profiles cannot change these permissions. */
export function VeniceChatPrivacySettings({ provider, value, model, onChange }: Props) {
  useTranslation()
  const [pending, setPending] = useState<{ value?: VeniceChatSecurity } | null>(null)
  const effective = resolveVeniceSettings(provider, undefined, undefined, value)
  const mode = effectiveTextPrivacy(effective)
  const providerMode = effectiveTextPrivacy(provider)
  const capabilities = model?.vendorMetadata?.capabilities as Record<string, unknown> | undefined
  const incompatible = !!model && (mode === 'e2ee'
    ? capabilities?.supportsE2EE !== true
    : mode === 'tee' && !supportsTee(model.vendorMetadata))
  const snapshot: VeniceChatSecurity = {
    textPrivacy: effective.textPrivacy || 'standard',
    e2eeToolsEnabled: effective.e2eeToolsEnabled === true,
    e2eeToolMode: effective.e2eeToolMode || 'encrypted-text',
    secureReceiptCompatibility: effective.secureReceiptCompatibility === true,
  }
  const change = (next: VeniceChatSecurity | undefined) => {
    const nextMode = effectiveTextPrivacy(resolveVeniceSettings(provider, undefined, undefined, next))
    if (rank[nextMode] < rank[mode]) setPending({ value: next })
    else onChange(next)
  }

  return <Stack gap="sm" data-testid="venice-chat-privacy">
    <Group justify="space-between" wrap="wrap">
      <Text fw={600}>{ft('Venice privacy for this chat')}</Text>
      <Badge variant="light">{ft(labels[mode])}</Badge>
    </Group>
    <Switch aria-label={ft('Use provider privacy defaults')} label={ft('Use provider privacy defaults')} checked={value === undefined}
      description={ft('Off: save a separate privacy configuration for this chat. Other chats and provider defaults stay unchanged.')}
      onChange={event => change(event.currentTarget.checked ? undefined : snapshot)} />
    <Text size="xs" c="dimmed">{ft('Provider default: {{mode}}', { mode: ft(labels[providerMode]) })}</Text>
    <Text size="sm">{mode === 'e2ee'
      ? ft('Text is encrypted on this device before sending and decrypted in the model enclave. Image, audio and video generation use HTTPS separately.')
      : mode === 'tee'
        ? ft('TEE checks the protected model environment. Venice can still read the request at its API; this mode is not end-to-end encryption.')
        : ft('HTTPS protects the connection. Venice can read the request. Choosing an E2EE-capable model alone does not encrypt messages on this device.')}</Text>
    {mode !== 'standard' && <Text size="xs" c="dimmed">{ft('Model hardware verification relies on Venice. This app does not independently verify the model software against approved code measurements.')}</Text>}
    {provider.privacyFilter === 'tee' && <Text size="xs" c="dimmed">{ft('The provider Privacy Only filter still requires TEE verification, even if HTTPS is selected here.')}</Text>}
    {incompatible && <Alert color="red">{ft('This model does not support the selected privacy mode. Sending is blocked before contacting Venice. Choose a compatible model or explicitly change this chat setting.')}</Alert>}
    {value !== undefined && <>
      <VeniceSettingSelect label={ft('Secure text chat')} value={value.textPrivacy || provider.textPrivacy || 'standard'}
        allowDeselect={false} data={Object.entries(labels).map(([value, label]) => ({ value, label: ft(label) }))}
        onChange={textPrivacy => textPrivacy && change({ ...snapshot, textPrivacy: textPrivacy as VeniceChatSecurity['textPrivacy'] })} />
      {mode !== 'standard' && <SecureReceiptSettings enabled={effective.secureReceiptCompatibility === true}
        onChange={secureReceiptCompatibility => onChange({ ...snapshot, secureReceiptCompatibility })} />}
      {mode === 'e2ee' && <E2EEToolSettings enabled={effective.e2eeToolsEnabled === true} mode={effective.e2eeToolMode || 'encrypted-text'}
        onChange={(e2eeToolsEnabled, e2eeToolMode) => onChange({ ...snapshot, e2eeToolsEnabled, e2eeToolMode })} />}
    </>}
    {value === undefined && mode !== 'standard' && <Text size="sm">{ft(effective.secureReceiptCompatibility
      ? 'Response verification: compatible gateway receipts (reduced assurance).'
      : 'Response verification: strict payload binding.')}</Text>}
    {value === undefined && mode === 'e2ee' && <Text size="sm">{ft(effective.e2eeToolsEnabled
      ? effective.e2eeToolMode === 'native' ? 'Tools: native metadata visible to Venice.' : 'Tools: encrypted text messages.'
      : 'Tools: disabled for encrypted chat.')}</Text>}
    <Text size="xs" c="dimmed">{ft('Changing privacy affects future requests, including history sent with them. It does not undo messages already sent. App lock and local storage encryption are separate.')}</Text>
    <AdaptiveModal opened={pending !== null} onClose={() => setPending(null)} title={ft('Use a less protected mode for this chat?')}>
      <Stack><Text>{ft('Venice may be able to read future requests in this mode. Only this chat changes; no automatic fallback occurs.')}</Text>
        <Text>{ft('New mode: {{mode}}', { mode: ft(labels[effectiveTextPrivacy(resolveVeniceSettings(provider, undefined, undefined, pending?.value))]) })}</Text>
        <Group justify="end"><Button variant="default" onClick={() => setPending(null)}>{ft('Cancel')}</Button>
          <Button color="orange" onClick={() => { if (pending) onChange(pending.value); setPending(null) }}>{ft('Change privacy for this chat')}</Button>
        </Group>
      </Stack>
    </AdaptiveModal>
  </Stack>
}
