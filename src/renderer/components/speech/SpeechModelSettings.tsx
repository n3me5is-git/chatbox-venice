import { Alert,Button,Group,NumberInput,Select,Stack,Text,TextInput } from '@mantine/core'
import { useEffect,useRef,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { speechSelection,type SpeechKind } from '@shared/speech'
import { SpeechError } from '@shared/speech-client'
import { speechClient,speechProviders } from '@/packages/speech/service'
import { settingsStore,useSettingsStore } from '@/stores/settingsStore'
import { forkT as ft } from '@/i18n/fork'
import { VeniceModelBadges } from '@/components/venice/VeniceModelBadges'
import { VeniceModelInfo } from '@/components/venice/VeniceModelInfo'
import { voiceChoices } from '@shared/providers/definitions/models/venice/catalog'
import type { MediaCatalogItem } from '@shared/providers/definitions/models/venice/media'
export function SpeechModelSettings({kind}:{kind:SpeechKind}){
  const {i18n}=useTranslation();const settings=useSettingsStore(state=>state),selection=speechSelection(settings,kind)
  const [provider,setProvider]=useState(selection?.provider||''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{if(selection?.provider)setProvider(selection.provider)},[selection?.provider])
  const controller=useRef<AbortController>();useEffect(()=>()=>controller.current?.abort(),[])
  const providers=speechProviders(),models=(settings.speechCatalog??[]).filter(item=>item.provider===provider&&item.kind===kind),model=models.find(item=>item.model===selection?.model),spec=model?.metadata
  const veniceModel=model?{id:model.model,type:kind,model_spec:model.metadata} as MediaCatalogItem:undefined
  const languageName=(code:string)=>{try{return new Intl.DisplayNames([i18n.resolvedLanguage||i18n.language||'en'],{type:'language'}).of(code)||code}catch{return code}}
  const recognitionLanguages=[...new Set(['it','en','de','fr','es','pt','zh','ja','ko','ru','ar','tr','sv','no',...(settings.speechOptions?.language?[settings.speechOptions.language]:[])])].filter(code=>code!=='auto')
  const choose=(modelId:string|null)=>{const state=settingsStore.getState();state.setSettings({[kind==='asr'?'defaultASRModel':'defaultTTSModel']:modelId?{provider,model:modelId}:undefined,...(kind==='tts'?{speechOptions:{...state.speechOptions,voice:undefined,speed:undefined}}:{})})}
  const load=async()=>{controller.current?.abort();const task=new AbortController();controller.current=task;setBusy(true);setError('');try{const catalog=await speechClient.catalog(provider,task.signal);task.signal.throwIfAborted();const state=settingsStore.getState();state.setSettings({speechCatalog:[...(state.speechCatalog??[]).filter(item=>item.provider!==provider),...catalog].slice(-2000)});if(!catalog.some(item=>item.kind===kind))setError('No compatible speech models were returned. You can enter a custom model ID.')}catch(error){if(!task.signal.aborted)setError(error instanceof SpeechError?ft(error.message,error.values):ft('Unable to load speech models'))}finally{if(!task.signal.aborted)setBusy(false)}}
  return <Stack gap="xs" style={{minWidth:0}}>
    <Select aria-label={ft('Speech provider')} placeholder={ft('Choose a speech provider')} data={providers.map(item=>({value:item.id,label:item.name}))} value={provider||null} onChange={value=>{controller.current?.abort();setBusy(false);setError('');setProvider(value||'');settingsStore.getState().setSettings({[kind==='asr'?'defaultASRModel':'defaultTTSModel']:undefined})}} comboboxProps={{withinPortal:false}} searchable/>
    <Group><Button size="xs" variant="default" loading={busy} disabled={!provider} onClick={()=>void load()}>{ft('Load speech models')}</Button><Text size="xs" c="dimmed">{ft('Catalog loading does not generate speech.')}</Text></Group>
    {provider==='venice'&&settings.providers?.venice?.venice?.audioEnabled!==true&&<Alert color="blue">{ft('Enable audio in Venice provider settings first')}</Alert>}
    <Select aria-label={ft(kind==='asr'?'Speech recognition model':'Speech synthesis model')} placeholder={ft('Choose a speech model')} disabled={!provider} data={models.map(item=>({value:item.model,label:item.name}))} value={selection?.provider===provider?selection.model:null} onChange={choose} searchable clearable comboboxProps={{withinPortal:false}} renderOption={({option})=><Group gap="xs" wrap="nowrap" style={{minWidth:0}}><Text size="sm" style={{flex:1,overflowWrap:'anywhere'}}>{option.label}</Text><VeniceModelBadges compact metadata={models.find(item=>item.model===option.value)?.metadata}/></Group>}/>
    {model&&<Group justify="space-between"><VeniceModelBadges metadata={model.metadata} showUnknown/>{provider==='venice'&&<VeniceModelInfo model={veniceModel}/>}</Group>}
    <details><summary>{ft('Custom speech model')}</summary><TextInput mt="xs" label={ft('Custom speech model ID')} value={selection?.provider===provider?selection.model:''} disabled={!provider} onChange={event=>choose(event.currentTarget.value||null)}/>{kind==='tts'&&<TextInput label={ft('Custom voice ID')} value={settings.speechOptions?.voice||''} onChange={event=>settingsStore.getState().setSettings({speechOptions:{...settingsStore.getState().speechOptions,voice:event.currentTarget.value||undefined}})}/>}<Text size="xs" c="dimmed">{ft('An unclassified model is blocked in private chats. Load the provider catalog to obtain privacy information.')}</Text></details>
    {kind==='tts'&&selection&&<><Select label={ft('Voice to use')} placeholder={ft('Model default voice')} data={voiceChoices(veniceModel,ft)} value={settings.speechOptions?.voice||null} onChange={value=>settingsStore.getState().setSettings({speechOptions:{...settingsStore.getState().speechOptions,voice:value||undefined}})} clearable searchable comboboxProps={{withinPortal:false}}/>
      {(provider==='openai'||spec?.supports_speed===true||spec?.min_speed!==undefined)&&<NumberInput label={ft('Speed')} min={Number(spec?.min_speed)||0.25} max={Number(spec?.max_speed)||4} step={0.1} value={settings.speechOptions?.speed??1} onChange={value=>settingsStore.getState().setSettings({speechOptions:{...settingsStore.getState().speechOptions,speed:Number(value)||1}})}/>}</>}
    {kind==='asr'&&<Select label={ft('Recognition language (optional)')} data={[{value:'auto',label:ft('Auto detect')},...recognitionLanguages.map(value=>({value,label:languageName(value)}))]} value={settings.speechOptions?.language||'auto'} onChange={value=>settingsStore.getState().setSettings({speechOptions:{...settingsStore.getState().speechOptions,language:value==='auto'?undefined:value||undefined}})} searchable allowDeselect={false} comboboxProps={{withinPortal:false}}/>}
    <Text size="xs" c="dimmed">{ft('Speech is on demand and may use provider credits. Private chats block non-private speech models; E2EE chats ask before using private speech over HTTPS.')}</Text>
    {error&&<Alert color="red">{ft(error)}</Alert>}
  </Stack>
}
