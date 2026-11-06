import { Alert,Button,Group,PasswordInput,Stack,Text } from '@mantine/core'
import { useEffect,useState,useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import type { UnlockStatus,VaultKeys } from '@/packages/vault/keys'
export function useScopeStatus(keys:VaultKeys,scope='app'){
  const revision=useSyncExternalStore(keys.subscribe,keys.snapshot,keys.snapshot);const [status,setStatus]=useState<UnlockStatus|null>(null);const [error,setError]=useState('')
  useEffect(()=>{let active=true;keys.status(scope).then(value=>{if(active){setStatus(value);setError('')}},()=>{if(active)setError(ft('Unable to read protection settings'))});return()=>{active=false}},[keys,scope,revision])
  return {status,error,revision}
}
export function ScopeUnlock({keys,scope='app',title,onUnlocked}:{keys:VaultKeys;scope?:string;title?:string;onUnlocked?:()=>void}){
  useTranslation();const {status,error:loadError}=useScopeStatus(keys,scope);const [pin,setPin]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false)
  const unlock=async(method:'pin'|'biometric')=>{setBusy(true);setError('');try{await keys.unlock(scope,method,pin);setPin('');onUnlocked?.()}catch(error){setError(error instanceof Error?error.message:ft('Unable to unlock'));setPin('')}finally{setBusy(false)}}
  return <Stack gap="sm"><Text fw={600}>{title||ft('Protected content')}</Text>{status?.pin&&<form onSubmit={event=>{event.preventDefault();void unlock('pin')}}><Stack gap="xs"><PasswordInput label={ft('PIN or passphrase')} value={pin} onChange={event=>setPin(event.currentTarget.value)} autoComplete="current-password" disabled={busy}/><Button type="submit" disabled={!pin} loading={busy}>{ft('Unlock')}</Button></Stack></form>}
    {status?.biometric&&<Button variant="default" loading={busy} onClick={()=>void unlock('biometric')}>{ft('Use device unlock')}</Button>}{status&&!status.configured&&<Text size="sm">{ft('Set up unlock methods in Settings → Data & Backup first.')}</Text>}{!status&&!loadError&&<Text size="sm">{ft('Loading protection settings…')}</Text>}{(error||loadError)&&<Alert color="red">{ft(error||loadError)}</Alert>}
  </Stack>
}
