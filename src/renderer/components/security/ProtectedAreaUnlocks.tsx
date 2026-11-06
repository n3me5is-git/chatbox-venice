import { Alert,Select,Stack,Text } from '@mantine/core'
import { useEffect,useState,useSyncExternalStore } from 'react'
import { forkT as ft } from '@/i18n/fork'
import { useTranslation } from 'react-i18next'
import type { VaultRuntime } from '@/packages/vault/runtime'
import { ScopeUnlock } from './ScopeUnlock'
import platform from '@/platform'
export function ProtectedAreaUnlocks({vault,force=false,onUnlocked}:{vault:VaultRuntime;force?:boolean;onUnlocked?:(scope:string)=>void}){
  useTranslation();const revision=useSyncExternalStore(vault.keys.subscribe,vault.keys.snapshot,vault.keys.snapshot);const [areas,setAreas]=useState<Array<{value:string;label:string}>>([]);const [selected,setSelected]=useState<string|null>(null);const [error,setError]=useState('')
  useEffect(()=>{let active=true;Promise.all([vault.db.scopes(),platform.getStoreValue('session-folders')]).then(([scopes,folders])=>{if(!active)return;const names=new Map((Array.isArray(folders)?folders:[]).map((folder:{id:string;name:string})=>[folder.id,folder.name]));const areas=scopes.filter(scope=>scope!=='public'&&(force||!vault.keys.isUnlocked(scope))).map(scope=>({value:scope,label:scope==='app'?ft('App unlock'):String(names.get(scope.replace(/^project:/,''))||ft('Protected project'))}));setAreas(areas);setSelected(current=>areas.some(area=>area.value===current)?current:areas[0]?.value||null);setError('')},()=>{if(active)setError(ft('Unable to read protection settings'))});return()=>{active=false}},[vault,revision,force])
  return <Stack gap="sm">{areas.length>1&&<Select comboboxProps={{withinPortal:false}} label={ft('Protected area to unlock')} data={areas} value={selected} onChange={setSelected}/>} {selected&&<ScopeUnlock key={selected} keys={vault.keys} scope={selected} title={areas.find(area=>area.value===selected)?.label} onUnlocked={()=>onUnlocked?.(selected)}/>}{!areas.length&&<Text size="xs" c="dimmed">{ft('Unlock methods can be configured in Data & Backup and in each project’s protection settings.')}</Text>}{error&&<Alert color="red">{error}</Alert>}</Stack>
}
