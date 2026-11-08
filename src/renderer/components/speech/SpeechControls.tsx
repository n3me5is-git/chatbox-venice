import { ActionIcon,Alert,Button,Group,Loader,Stack,Text } from '@mantine/core'
import { IconMicrophone,IconVolume } from '@tabler/icons-react'
import { useCallback,useEffect,useRef,useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chatSpeechPrivacy,speechPrivacyDecision,speechSelection,type SpeechKind } from '@shared/speech'
import { SpeechError,type SpeechContext } from '@shared/speech-client'
import { spokenMarkdown } from '@shared/spoken-markdown'
import { speechClient } from '@/packages/speech/service'
import { useSessionSettings } from '@/stores/session/session-settings'
import { useSettingsStore } from '@/stores/settingsStore'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { VeniceRecorder } from '@/components/venice/VeniceRecorder'
import { forkT as ft } from '@/i18n/fork'
import { requestSpeechConsent } from './SpeechConsent'

const failure=(error:unknown)=>error instanceof SpeechError?ft(error.message,error.values):ft('Speech could not be completed. Check the provider and try again explicitly.')
function useSpeechGuard(context:SpeechContext,kind:SpeechKind,stop:()=>void){
  useTranslation();const latest=useRef(stop);latest.current=stop
  const settings=useSettingsStore(state=>state),{sessionSettings}=useSessionSettings(context.sessionId==='new'?null:context.sessionId??null),selection=speechSelection(settings,kind)
  const metadata=settings.speechCatalog?.find(item=>item.provider===selection?.provider&&item.model===selection?.model&&item.kind===kind)?.metadata
  const privacy=chatSpeechPrivacy(settings,sessionSettings,context.selected),blocked=speechPrivacyDecision(privacy,metadata)==='block'
  const provider=selection?settings.providers?.[selection.provider]:undefined
  const identity=JSON.stringify([context,selection,provider?.apiKey,provider?.apiHost,provider?.venice?.enabled,provider?.venice?.audioEnabled,settings.speechOptions,metadata,privacy])
  useEffect(()=>{
    const cancel=()=>latest.current(),hidden=()=>{if(document.hidden)cancel()}
    const unsubscribe=vaultRuntimeFor(platform).keys.subscribe(cancel)
    window.addEventListener('chatbox:privacy-lock',cancel);window.addEventListener('chatbox:speech-start',cancel);document.addEventListener('visibilitychange',hidden)
    return()=>{unsubscribe();window.removeEventListener('chatbox:privacy-lock',cancel);window.removeEventListener('chatbox:speech-start',cancel);document.removeEventListener('visibilitychange',hidden);cancel()}
  },[identity])
  return blocked
}
export function SpeechMicrophone({context,onText,disabled=false,client=speechClient}:{context:SpeechContext;onText:(text:string)=>void;disabled?:boolean;client?:Pick<typeof speechClient,'check'|'transcribe'>}){
  const [opened,setOpened]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[file,setFile]=useState<File|null>(null),[formats,setFormats]=useState<string[]>()
  const controller=useRef<AbortController>()
  const stop=useCallback(()=>{controller.current?.abort();setOpened(false);setReady(false);setBusy(false);setFile(null);setError('')},[])
  const blocked=useSpeechGuard(context,'asr',stop)
  const open=async()=>{
    window.dispatchEvent(new Event('chatbox:speech-start'));setOpened(true);setError('');setReady(false);const task=new AbortController();controller.current=task
    try{const selected=await client.check('asr',context);task.signal.throwIfAborted();const values=selected.model?.metadata?.accepted_audio_formats;setFormats(Array.isArray(values)?values.map(String):undefined);setReady(true)}catch(error){if(!task.signal.aborted)setError(failure(error))}
  }
  const transcribe=async()=>{
    if(!file||busy)return;const task=new AbortController();controller.current=task;setBusy(true);setError('')
    try{const text=await client.transcribe(context,file,task.signal,()=>requestSpeechConsent(task.signal));task.signal.throwIfAborted();onText(text);stop()}catch(error){if(!task.signal.aborted&&(error as Error)?.name!=='AbortError')setError(failure(error))}finally{if(!task.signal.aborted)setBusy(false)}
  }
  return <>
    <ActionIcon aria-label={ft('Dictate a prompt')} title={ft('Dictate a prompt')} aria-disabled={blocked||disabled} disabled={disabled} variant="subtle" size={32} radius="xl" style={{opacity:blocked?0.45:1,flexShrink:0,marginBottom:4}} onClick={()=>void open()}><IconMicrophone size={20}/></ActionIcon>
    <AdaptiveModal opened={opened} onClose={stop} title={ft('Dictate a prompt')}><Stack>
      {error&&<Alert color="red" role="alert">{error}</Alert>}
      {!ready&&!error&&<Loader size="sm"/>}
      {ready&&<><Text size="sm">{ft('The recording is transcribed with your global speech recognition model. The resulting text is added to the draft; it is never sent to the chat automatically.')}</Text>
        {!busy&&<VeniceRecorder compatibleFormats={formats} onRecorded={value=>{setFile(value);setError('')}}/>}
        {file&&<Text size="sm">{ft('Recording ready to transcribe')}</Text>}
        <Group justify="end"><Button variant="default" onClick={stop}>{ft('Cancel')}</Button><Button loading={busy} disabled={!file} onClick={()=>void transcribe()}>{ft('Transcribe into draft')}</Button></Group>
      </>}
    </Stack></AdaptiveModal>
  </>
}
export function SpeechReadAloud({context,text,client=speechClient}:{context:SpeechContext;text:()=>string;client?:Pick<typeof speechClient,'synthesize'>}){
  const [opened,setOpened]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[url,setUrl]=useState('')
  const controller=useRef<AbortController>(),owned=useRef(''),audio=useRef<HTMLAudioElement|null>(null)
  const stop=useCallback(()=>{controller.current?.abort();audio.current?.pause();if(owned.current)URL.revokeObjectURL(owned.current);owned.current='';setUrl('');setBusy(false);setOpened(false);setError('')},[])
  const blocked=useSpeechGuard(context,'tts',stop)
  const read=async()=>{
    window.dispatchEvent(new Event('chatbox:speech-start'));setOpened(true);setBusy(true);setError('');const task=new AbortController();controller.current=task
    try{const blob=await client.synthesize(context,spokenMarkdown(text()),task.signal,()=>requestSpeechConsent(task.signal));task.signal.throwIfAborted();owned.current=URL.createObjectURL(blob);setUrl(owned.current)}catch(error){if((error as Error)?.name==='AbortError')stop();else if(!task.signal.aborted)setError(failure(error))}finally{if(!task.signal.aborted)setBusy(false)}
  }
  return <>
    <ActionIcon aria-label={ft('Read aloud')} title={ft('Read aloud')} aria-disabled={blocked} variant="subtle" color="chatbox-secondary" size="lg" style={{opacity:blocked?0.45:1}} onClick={()=>void read()}><IconVolume size={20}/></ActionIcon>
    <AdaptiveModal opened={opened} onClose={stop} title={ft('Read aloud')}><Stack>
      {error&&<Alert color="red" role="alert">{error}</Alert>}{busy&&<Group><Loader size="sm"/><Text>{ft('Preparing speech…')}</Text></Group>}
      {url&&<audio ref={audio} aria-label={ft('Reply audio')} src={url} autoPlay controls style={{width:'100%'}}/>}
      <Text size="xs" c="dimmed">{ft('Reading is on demand and may use credits. Audio stays in memory only while this player is open.')}</Text>
      <Button variant="default" onClick={stop}>{ft(busy?'Cancel':'Close')}</Button>
    </Stack></AdaptiveModal>
  </>
}
