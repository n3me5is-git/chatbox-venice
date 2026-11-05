import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import type { VaultKeys } from '@/packages/vault/keys'
import { ScopeUnlock } from './ScopeUnlock'

/** A creation may belong to a dedicated project PIN rather than the app scope. */
export function CreationUnlock({keys,protection}:{keys:VaultKeys;protection?:string}){
  useTranslation()
  const scope=protection||'app'
  return <ScopeUnlock key={scope} keys={keys} scope={scope} title={ft('Locked creation')}/>
}
