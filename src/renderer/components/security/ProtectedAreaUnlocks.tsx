import { Alert,Select,Stack,Text } from '@mantine/core'
import { useEffect,useState,useSyncExternalStore } from 'react'
import { forkT as ft } from '@/i18n/fork'
import { useTranslation } from 'react-i18next'
import type { VaultRuntime } from '@/packages/vault/runtime'
import { ScopeUnlock } from './ScopeUnlock'
import platform from '@/platform'
export function ProtectedAreaUnlocks({vault,force=false,unlockedScopes,onUnlocked}:{vault:VaultRuntime;force?:boolean;unlockedScopes?:ReadonlySet<string>;onUnlocked?:(scope:string)=>void}){
  useTranslation();const revision=useSyncExternalStore(vault.keys.subscribe,vault.keys.snapshot,vault.keys.snapshot);const [areas,setAreas]=useState<Array<{value:string;label:string}>>([]);const [selected,setSelected]=useState<string|null>(null);const [error,setError]=useState('')
  useEffect(()=>{let active=true;Promise.all([vault.db.scopes(),platform.getStoreValue('session-folders')]).then(([scopes,folders])=>{if(!active)return;const names=new Map((Array.isArray(folders)?folders:[]).map((folder:{id:string;name:string})=>[folder.id,folder.name]));const areas=scopes.filter(scope=>scope!=='public'&&(force||!vault.keys.isUnlocked(scope))).map(scope=>({value:scope,label:scope==='app'?ft('App unlock'):String(names.get(scope.replace(/^project:/,''))||ft('Protected project'))}));setAreas(areas);setSelected(current=>areas.some(area=>area.value===current)?current:areas[0]?.value||null);setError('')},()=>{if(active)setError(ft('Unable to read protection settings'))});return()=>{active=false}},[vault,revision,force])
  const pending=areas.filter(area=>!unlockedScopes?.has(area.value))
  const active=pending.some(area=>area.value===selected)?selected:pending[0]?.value
  return <Stack gap="sm">{pending.length>1&&<Select comboboxProps={{withinPortal:false}} label={ft('Protected area to unlock')} data={pending} value={active||null} onChange={setSelected}/>} {active&&<ScopeUnlock key={active} keys={vault.keys} scope={active} title={pending.find(area=>area.value===active)?.label} onUnlocked={()=>onUnlocked?.(active)}/>}{!areas.length&&!unlockedScopes?.size&&<Text size="xs" c="dimmed">{ft('Unlock methods can be configured in Data & Backup and in each project’s protection settings.')}</Text>}{error&&<Alert color="red">{ft(error)}</Alert>}</Stack>
}
