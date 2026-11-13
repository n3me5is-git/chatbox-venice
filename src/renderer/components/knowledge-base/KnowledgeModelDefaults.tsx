import {Button,Group,Stack,Text} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import {ModelSelectorV2} from '@/components/ModelSelectorV2'
import {settingsStore,useSettingsStore} from '@/stores/settingsStore'
import {forkT as ft} from '@/i18n/fork'
export function KnowledgeModelDefaults(){
 useTranslation();const selected=useSettingsStore(state=>state.defaultVirtualRerankModel)
 return <Stack gap="xs"><Text fw={600}>{ft('Virtual reranking with LLM')}</Text><Text size="xs" c="dimmed">{ft('Default text model for optional collection reranking. Each collection must enable it and approve processing its query and passages.')}</Text><Group wrap="wrap"><ModelSelectorV2 selectedProviderId={selected?.provider} selectedModelId={selected?.model} modelFilter={model=>!model.type||model.type==='chat'} onSelect={(provider,model)=>settingsStore.getState().setSettings({defaultVirtualRerankModel:{provider,model}})}><Button variant="default" style={{height:'auto',minHeight:44,whiteSpace:'normal',overflowWrap:'anywhere'}}>{selected?.model||ft('Choose a reranking LLM')}</Button></ModelSelectorV2>{selected&&<Button variant="subtle" onClick={()=>settingsStore.getState().setSettings({defaultVirtualRerankModel:undefined})}>{ft('Clear')}</Button>}</Group></Stack>
}
