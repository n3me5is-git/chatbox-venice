import NiceModal,{useModal} from '@ebay/nice-modal-react'
import { Alert,Button,Group,PasswordInput,Select,Stack,Text } from '@mantine/core'
import { useEffect,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { rendererApplication } from '@/app/renderer-application'
import { stopAllMessageGenerations } from '@/stores/session/generation-cancellation'
import platform from '@/platform'
import { installedVaultFor } from '@/packages/vault/runtime'
import { ScopeUnlock,useScopeStatus } from './ScopeUnlock'
import { SettingsSection } from '@/components/settings/SettingsLayout'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { dismissPrivateSurfaces,usePrivacyDismiss } from './usePrivacyDismiss'
import { uiStore } from '@/stores/uiStore'
export function ProjectProtectionControls({folderId}:{folderId:string}){
  useTranslation();const vault=installedVaultFor(platform);if(!vault?.projects)return <Text>{ft('Project protection is available in the native app')}</Text>
  return <Controls folderId={folderId}/>
}
function Controls({folderId}:{folderId:string}){
  const vault=installedVaultFor(platform)!;const {revision}=useScopeStatus(vault.keys);const [mode,setMode]=useState('none');const [scope,setScope]=useState<string|null>(null);const [pin,setPin]=useState(''),[repeat,setRepeat]=useState(''),[error,setError]=useState('');const [busy,setBusy]=useState(false);const [ready,setReady]=useState(false)
  useEffect(()=>{let active=true;setReady(false);vault.projects.policies().then(policies=>{if(active){setMode(policies[folderId]?.mode||'none');setScope(policies[folderId]?.scope||null);setReady(true);setError('')}},()=>{if(active)setError(ft('Unable to read project protection'))});return()=>{active=false}},[folderId,revision])
  const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');try{await work();setPin('');setRepeat('');await rendererApplication.queryClient.resetQueries()}catch(error){setError(error instanceof Error?error.message:String(error))}finally{setBusy(false)}}
  const save=()=>run(async()=>{if(mode==='pin'&&pin!==repeat)throw new Error(ft('Enter and confirm the same PIN or passphrase'));await vault.projects.setPolicy(folderId,mode as 'none'|'app'|'pin',pin||undefined)})
  const lock=()=>run(async()=>{const [{getImageGenerationService},{veniceMediaService},{sessionApprovals}]=await Promise.all([import('@/stores/imageGenerationActions'),import('@/packages/venice/service'),import('@/packages/venice/session-approvals')]);const images=getImageGenerationService();const active=images.getSnapshot().currentGeneratingId;if(active&&(await images.getRecord(active))?.protection===scope)await images.cancel();for(const record of await veniceMediaService.list())if(record.protection===scope&&veniceMediaService.isActive(record.id))await veniceMediaService.pause(record.id);sessionApprovals.clearAll();for(const id of rendererApplication.generationRuntime.getGeneratingSessionIds())if(await vault.projects.sessionScope(id)===scope)await stopAllMessageGenerations(id);dismissPrivateSurfaces();uiStore.getState().setPictureShow(null);uiStore.getState().setOpenSearchDialog(false);vault.keys.lock(scope!);await rendererApplication.queryClient.cancelQueries()})
  const locked=!!scope&&!vault.keys.isUnlocked(scope)
  return <Stack gap="sm"><Text size="sm" c="dimmed">{ft('Project locks control access inside the app, including chat reads, search and changes. They do not encrypt the existing conversation database or external Work Mode files. Venice generations belonging to these chats are moved to this project’s protected media area. Other generated media has its own protection controls.')}</Text>
    {locked&&<ScopeUnlock keys={vault.keys} scope={scope!} title={ft('Unlock this project')}/>}
    <Select comboboxProps={{withinPortal:false}} label={ft('Project protection')} value={mode} onChange={value=>setMode(value||'none')} disabled={!ready||busy||locked} data={[{value:'none',label:ft('No project lock')},{value:'app',label:ft('Use app unlock')},{value:'pin',label:ft('Use a dedicated project PIN')}]}/>
    {mode==='app'&&<><Text size="sm">{ft('Projects using app unlock share the app’s current unlocked state. Configure app unlock methods in Data & Backup first.')}</Text>{!vault.keys.isUnlocked('app')&&<ScopeUnlock keys={vault.keys}/>}</>}
    {mode==='pin'&&!locked&&<><PasswordInput label={ft('New project PIN or passphrase')} description={ft('Enter a new PIN to change it, or leave blank to keep the existing dedicated PIN.')} value={pin} onChange={event=>setPin(event.currentTarget.value)} autoComplete="new-password"/><PasswordInput label={ft('Confirm PIN or passphrase')} value={repeat} onChange={event=>setRepeat(event.currentTarget.value)} autoComplete="new-password"/></>}
    <Group><Button loading={busy} disabled={!ready||locked} onClick={()=>void save()}>{ft('Save project protection')}</Button>{scope&&!locked&&<Button variant="default" disabled={busy} onClick={()=>void lock()}>{ft('Lock project now')}</Button>}</Group>{error&&<Alert color="red">{error}</Alert>}
  </Stack>
}
export function ProjectProtectionSettings(){
  useTranslation();const {folders}=rendererApplication.sessionHooks.useSessionFolders();const [folderId,setFolderId]=useState<string|null>(null)
  return <SettingsSection title={ft('Project protection')}><Stack p="md"><Select comboboxProps={{withinPortal:false}} label={ft('Project')} placeholder={ft('Select a project')} value={folderId} onChange={setFolderId} data={(folders||[]).map(folder=>({value:folder.id,label:folder.name}))}/>{folderId&&<ProjectProtectionControls key={folderId} folderId={folderId}/>}</Stack></SettingsSection>
}
const ProjectProtectionModal=NiceModal.create(({folderId}:{folderId:string})=>{const modal=useModal();useTranslation();usePrivacyDismiss(modal,null);return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve();modal.hide()}} title={ft('Project protection')} size="lg"><ProjectProtectionControls folderId={folderId}/></AdaptiveModal>})
export const showProjectProtection=(folderId:string)=>NiceModal.show(ProjectProtectionModal,{folderId})
