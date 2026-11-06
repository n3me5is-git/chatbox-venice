import {Alert,Button,Group,Stack,Switch,Text} from '@mantine/core'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {AdaptiveModal} from '@/components/common/AdaptiveModal'
import {forkT as ft} from '@/i18n/fork'

export function SecureReceiptSettings({enabled,onChange}:{enabled:boolean;onChange:(value:boolean)=>void}){
 useTranslation();const [opened,setOpened]=useState(false)
 return <Stack gap="xs"><Switch aria-label={ft('Compatible gateway receipts')} label={ft('Compatible gateway receipts')} description={ft('Allow Venice gateway signatures when exact request and response hashes cannot be reproduced locally. Off by default.')} checked={enabled} onChange={event=>event.currentTarget.checked?setOpened(true):onChange(false)}/>
 {enabled&&<Alert color="orange">{ft('Gateway receipt compatibility is enabled. Encryption and attested signer checks remain active. The app cannot independently prove that the signed hashes describe the response it received, including tool calls.')}</Alert>}
 <Text size="xs" c="dimmed">{ft('NEAR gateway signatures require public gateway attestation and local Intel certificate checks using Phala certificate collateral. These services receive no prompt, media or Venice API key. Model code measurements are not allowlisted.')}</Text>
 <AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title={ft('Allow compatible gateway receipts?')}><Stack>
 <Text>{ft('Venice transforms model identifiers and response metadata between the app and the enclave gateway. Gateway hashes therefore may differ from the bytes available to this app. This is separate from signature validity.')}</Text>
 <Alert color="orange">{ft('This option verifies the fresh attestation, encryption and signature from the attested key, and checks receipt identifiers. It trusts provider-reported payload hashes instead of independently matching them to this request and response. A substituted or replayed payload may not be detected. Tools still require their normal permissions.')}</Alert>
 <Text size="sm">{ft('No automatic fallback or plaintext retry occurs. Disable this option to require exact payload binding again.')}</Text>
 <Group justify="end"><Button variant="default" onClick={()=>setOpened(false)}>{ft('Cancel')}</Button><Button color="orange" onClick={()=>{onChange(true);setOpened(false)}}>{ft('Enable compatible receipts')}</Button></Group>
 </Stack></AdaptiveModal></Stack>
}
