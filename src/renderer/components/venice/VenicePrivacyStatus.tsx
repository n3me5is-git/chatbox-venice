import { Alert, Badge, Button, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconLock, IconShieldCheck, IconShieldExclamation } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProviderModelInfo, SessionSettings } from '@shared/types'
import { resolveVeniceSettings, type VeniceOptions } from '@shared/providers/definitions/models/venice/options'
import { effectiveTextPrivacy } from '@shared/providers/definitions/models/venice/privacy'
import { ResponseSecuritySchema, type ResponseSecurity } from '@shared/response-security'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { forkT as ft } from '@/i18n/fork'

export function VenicePrivacyStatus({ provider, session, model }: { provider?: VeniceOptions; session?: SessionSettings; model?: ProviderModelInfo }) {
  useTranslation()
  const [opened,setOpened]=useState(false)
  const settings=resolveVeniceSettings(provider,model?.veniceProfile,session?.veniceProfile,session?.veniceSecurity)
  const mode=effectiveTextPrivacy(settings,model?.vendorMetadata)
  if(mode==='standard')return null
  return <><UnstyledButton onClick={()=>setOpened(true)} aria-label={ft('Current chat privacy')}><Badge color="teal" variant="light" leftSection={<IconLock size={12}/>}>{mode==='e2ee'?'E2EE':'TEE'}{(settings.textPrivacy??'auto')==='auto'?' · '+ft('Auto'):''}</Badge></UnstyledButton>
    <AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title={ft('Current chat privacy')}><Stack gap="sm">
      <Text>{ft(mode==='e2ee'?'This chat requests end-to-end encryption on this device.':'This chat requires TEE verification. The request is visible to Venice at its API.')}</Text>
      <Text size="sm">{ft('Each successful reply has its own verification badge. This mode indicator is not proof that a request has already passed verification.')}</Text>
      <Text size="sm">{ft('Verification failures block the request. There is no automatic switch to HTTPS.')}</Text>
      <Text size="sm">{ft('Change Automatic, E2EE, TEE or HTTPS in the privacy section of Conversation Settings.')}</Text>
      <Button onClick={()=>setOpened(false)}>{ft('Close')}</Button>
    </Stack></AdaptiveModal></>
}

export function VerifiedResponseStatus({ value }: { value: unknown }) {
  useTranslation();const [opened,setOpened]=useState(false)
  const parsed=ResponseSecuritySchema.safeParse(value)
  if(!parsed.success)return null
  const evidence=parsed.data,compatible=evidence.receipt==='gateway-signature-only'
  const Icon=compatible?IconShieldExclamation:IconShieldCheck
  return <><UnstyledButton onClick={()=>setOpened(true)} aria-label={ft('Response security details')}><Badge variant="light" color={compatible?'yellow':'teal'} leftSection={<Icon size={13}/>}>{evidence.mode==='e2ee'?'E2EE':'TEE'} · {ft(compatible?'Limited receipt verification':'Response verified')}</Badge></UnstyledButton>
    <AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title={ft('Response security details')}><VerificationDetails evidence={evidence}/></AdaptiveModal></>
}

export function VerificationDetails({ evidence }: { evidence: ResponseSecurity }) {
  return <Stack gap="sm">
    <Text fw={600}>{evidence.mode==='e2ee'?'E2EE':'TEE'} · {evidence.modelId}</Text>
    <Text size="sm">{ft('Verified when received')}: {new Date(evidence.verifiedAt).toLocaleString()} · {ft('Verified responses')}: {evidence.responses}</Text>
    <Text size="sm">{ft(evidence.mode==='e2ee'?'Text was encrypted on this device and decrypted in the model enclave.':'TEE verification was required; the prompt itself was sent over HTTPS and was readable by Venice.')}</Text>
    <Text size="sm">{ft('Checks passed for fresh attestation, requested model, nonce, debug policy and response signer.')}</Text>
    {evidence.receipt==='payload-bound'?<Text size="sm">{ft('The response signature was independently matched to the received payload.')}</Text>:<Alert color="yellow">{ft('Compatible gateway receipt: the signer was checked, but independent binding to this exact response payload could not be established. This provides reduced assurance.')}</Alert>}
    <Text size="sm">{ft('Model hardware attestation relies on Venice verification. This is not an independent audit of enclave software or a guarantee that every hardware attack is impossible.')}</Text>
    <Text size="sm">{ft(evidence.tools==='encrypted-text'?'Tool definitions and messages used the encrypted text channel. External tools still receive the data passed to them.':evidence.tools==='native'?'Native tool metadata, names and arguments were visible to Venice. Non-empty text results used the encrypted channel.':'No encrypted client tool exchange was observed in these responses.')}</Text>
    <Text size="xs" c="dimmed">{ft('This records verification at reception, not re-verification of an edited, imported or shared transcript. Media generation and app storage use separate protections.')}</Text>
  </Stack>
}
