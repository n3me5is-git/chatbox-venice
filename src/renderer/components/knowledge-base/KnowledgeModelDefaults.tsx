import {Button,Group,Stack,Text} from '@mantine/core'
import {useTranslation} from 'react-i18next'
import {ModelSelectorV2} from '@/components/ModelSelectorV2'
import {settingsStore,useSettingsStore} from '@/stores/settingsStore'
import {forkT as ft} from '@/i18n/fork'
export function KnowledgeModelDefaults(){
 useTranslation();const settings=useSettingsStore(state=>state)
 const slots=[['defaultVirtualRerankModel','Virtual reranking with LLM','Choose a reranking LLM'],['defaultKnowledgeExtractionModel','Knowledge extraction model','Choose a knowledge extraction model first'],['defaultKnowledgeVerifierModel','Knowledge verification model','Choose a knowledge verifier']] as const
 return <Stack gap="md">{slots.map(([key,title,empty])=>{const selected=settings[key];return <Stack gap="xs" key={key}><Text fw={600}>{ft(title)}</Text><Text size="xs" c="dimmed">{ft('Global knowledge models are used only after the collection or chat enables the corresponding feature and confirms provider processing.')}</Text><Group wrap="wrap"><ModelSelectorV2 selectedProviderId={selected?.provider} selectedModelId={selected?.model} modelFilter={model=>!model.type||model.type==='chat'} onSelect={(provider,model)=>settingsStore.getState().setSettings({[key]:{provider,model}})}><Button variant="default" style={{height:'auto',minHeight:44,whiteSpace:'normal',overflowWrap:'anywhere'}}>{selected?.model||ft(empty)}</Button></ModelSelectorV2>{selected&&<Button aria-label={ft('Clear')+' '+ft(title)} variant="subtle" onClick={()=>settingsStore.getState().setSettings({[key]:undefined})}>{ft('Clear')}</Button>}</Group></Stack>})}</Stack>
}
