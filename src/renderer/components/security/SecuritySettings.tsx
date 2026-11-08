import { Alert,Button,Group,TextInput,PasswordInput,Stack,Switch,Text } from '@mantine/core'
import { useEffect,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { vaultRuntimeFor,type VaultRuntime } from '@/packages/vault/runtime'
import type { DeviceCapabilities } from '@/packages/vault/device'
import { SettingsSection } from '@/components/settings/SettingsLayout'
import { ScopeUnlock,useScopeStatus } from './ScopeUnlock'
import { BACKGROUND_LOCK_DELAY, lockDelaySeconds } from '@/packages/vault/background-lock'
export function SecuritySettings({runtime}:{runtime?:Pick<VaultRuntime,'keys'|'db'>}={}){
  useTranslation();const vault=runtime||vaultRuntimeFor(platform);const {status,revision,error:loadError}=useScopeStatus(vault.keys);const [caps,setCaps]=useState<DeviceCapabilities|null>(null);const [pinEnabled,setPinEnabled]=useState(true);const [bio,setBio]=useState(false);const [pin,setPin]=useState('');const [repeat,setRepeat]=useState('');const [enabled,setEnabled]=useState(false);const [background,setBackground]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('')
  useEffect(()=>{void vault.keys.capabilities().then(setCaps).catch(()=>setError(ft('Device encryption is unavailable')))},[vault])
  const [delayInput,setDelayInput]=useState('0')
  useEffect(()=>{let active=true;Promise.all([vault.db.getSetting<boolean>('app-lock-enabled'),vault.db.getSetting<boolean>('lock-on-background'),vault.db.getSetting<number>(BACKGROUND_LOCK_DELAY)]).then(([enabled,background,delay])=>{if(active){setEnabled(enabled===true);setBackground(background!==false);setDelayInput(String(lockDelaySeconds(delay)))}}).catch(()=>setError(ft('Unable to read protection settings')));return()=>{active=false}},[vault,revision])
  useEffect(()=>{if(status?.configured){setPinEnabled(status.pin);setBio(status.biometric)}},[status?.configured,status?.pin,status?.biometric])
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await action();vault.keys.refresh()}catch(error){setError(error instanceof Error?error.message:String(error))}finally{setBusy(false)}}
  const save=()=>run(async()=>{if(pinEnabled&&(!status?.pin&&!pin||pin!==repeat))throw new Error(ft('Enter and confirm the same PIN or passphrase'));await vault.keys.configure('app',{pin:pinEnabled&&pin?pin:undefined,keepPin:pinEnabled&&!pin&&!!status?.pin,biometric:bio});setPin('');setRepeat('');setNotice(ft('Protection settings saved'))})
  return <SettingsSection title={ft('App lock and protected content')}><Stack p="md" gap="sm">
    <Text size="sm" c="dimmed">{ft('Choose a PIN, device unlock, or both. Protected library content stays encrypted when locked. App lock controls access to the whole app; existing ordinary chat databases are not encrypted by this switch.')}</Text>
    <Text size="xs" c="dimmed">{ft('Locking stops active generations and closes previews and approval dialogs.')}</Text>
    {caps&&!caps.encryption&&<Alert color="yellow">{ft('Device encryption is unavailable. On Android, configure a secure screen lock. Native key protection is available in the Windows and Android apps.')}</Alert>}
    {status?.configured&&!vault.keys.isUnlocked('app')?<ScopeUnlock keys={vault.keys}/>:<>
      <Switch label={ft('Enable PIN or passphrase')} checked={pinEnabled} onChange={event=>setPinEnabled(event.currentTarget.checked)} disabled={busy||!caps?.encryption}/>
      {pinEnabled&&<><PasswordInput label={status?.pin?ft('Change PIN or passphrase (optional)'):ft('New PIN or passphrase')} description={ft('At least 6 digits or a passphrase of 10 characters. Keep a separate encrypted backup; a forgotten PIN cannot be recovered.')} value={pin} onChange={event=>setPin(event.currentTarget.value)} autoComplete="new-password"/><PasswordInput label={ft('Confirm PIN or passphrase')} value={repeat} onChange={event=>setRepeat(event.currentTarget.value)} autoComplete="new-password"/></>}
      <Switch label={ft('Enable biometric or device unlock')} description={caps?.name} checked={bio} onChange={event=>setBio(event.currentTarget.checked)} disabled={busy||!caps?.biometric&&!bio}/>
      <Button onClick={()=>void save()} loading={busy} disabled={!caps?.encryption||!pinEnabled&&!bio}>{ft('Save unlock methods')}</Button>
      {status?.configured&&<><Switch label={ft('Require unlock to open the app')} checked={enabled} onChange={event=>{const checked=event.currentTarget.checked;void run(async()=>{await vault.db.setSetting('app-lock-enabled',checked);setEnabled(checked)})}} disabled={busy}/><Switch label={ft('Lock when the app goes into the background')} checked={background} onChange={event=>{const checked=event.currentTarget.checked;void run(async()=>{await vault.db.setSetting('lock-on-background',checked);setBackground(checked)})}} disabled={busy}/><Button variant="default" onClick={()=>void import('./AppGate').then(({lockApplication})=>lockApplication())}>{ft('Lock protected content now')}</Button></>}
      {status?.configured&&background&&<TextInput type="number" inputMode="numeric" label={ft('Background lock delay')} description={ft('Seconds after leaving the app. Use 0 to lock immediately. The app stays unlocked during this delay.')} min={0} max={86400} step={1} rightSection={<Text size="xs" c="dimmed">s</Text>} value={delayInput} onChange={event=>setDelayInput(event.currentTarget.value)} onBlur={event=>{const value=lockDelaySeconds(Number(event.currentTarget.value));void run(async()=>{await vault.db.setSetting(BACKGROUND_LOCK_DELAY,value);setDelayInput(String(value))})}} disabled={busy}/>}
    </>}{(error||loadError)&&<Alert color="red">{ft(error||loadError)}</Alert>}{notice&&<Alert color="green">{notice}</Alert>}
  </Stack></SettingsSection>
}
