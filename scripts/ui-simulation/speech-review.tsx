import { Button,Group,Stack,Textarea } from '@mantine/core'
import { useState } from 'react'
import { SpeechClient } from '../../src/shared/speech-client'
import { speechBinding,type SpeechPrivacy } from '../../src/shared/speech'
import { SpeechMicrophone,SpeechReadAloud } from '../../src/renderer/components/speech/SpeechControls'
import { AdaptiveModal } from '../../src/renderer/components/common/AdaptiveModal'
import { settingsStore } from '../../src/renderer/stores/settingsStore'
const provider={id:'venice',apiHost:'https://speech-test.invalid/v1',apiKey:'SIMULATED_SPEECH_ONLY',enabled:true,audioEnabled:true}
let privacy:SpeechPrivacy='private'
const wav=new Uint8Array(8044),header=new DataView(wav.buffer),ascii=(at:number,text:string)=>Array.from(text).forEach((letter,n)=>wav[at+n]=letter.charCodeAt(0))
ascii(0,'RIFF');header.setUint32(4,wav.length-8,true);ascii(8,'WAVEfmt ');header.setUint32(16,16,true);header.setUint16(20,1,true);header.setUint16(22,1,true);header.setUint32(24,8000,true);header.setUint32(28,16000,true);header.setUint16(32,2,true);header.setUint16(34,16,true);ascii(36,'data');header.setUint32(40,wav.length-44,true)
const client=new SpeechClient({settings:()=>settingsStore.getState().getSettings(),provider:()=>provider,privacy:async()=>privacy,assertAccess:async()=>{},request:async request=>{
  const calls=(window as any).__speechCalls??=[]
  if(request.url.endsWith('/audio/transcriptions')){if(!(request.body instanceof FormData)||!(request.body.get('file') instanceof File))throw Error('Missing microphone recording');calls.push({kind:'asr',bytes:(request.body.get('file') as File).size});return Response.json({text:'Dictated test text'})}
  if(request.url.endsWith('/audio/speech')){calls.push({kind:'tts',input:JSON.parse(String(request.body)).input});return new Response(wav,{headers:{'content-type':'audio/wav'}})}
  throw Error('Unexpected speech test endpoint')
}})
async function configure(mode:'private'|'public-speech'|'e2ee'){
  privacy=mode==='e2ee'?'e2ee':'private';const binding=await speechBinding(provider.id,provider.apiHost,provider.apiKey),state=settingsStore.getState()
  state.setSettings({providers:{...state.providers,venice:{apiKey:'',models:[{modelId:'speech-chat',vendorMetadata:{privacy:'private'}}],venice:{enabled:true,audioEnabled:true,textPrivacy:mode==='e2ee'?'e2ee':'standard'}}},defaultASRModel:{provider:'venice',model:'asr-test'},defaultTTSModel:{provider:'venice',model:'tts-test'},speechOptions:undefined,speechCatalog:(['asr','tts'] as const).map(kind=>({provider:'venice',model:kind+'-test',name:kind,kind,binding,metadata:{privacy:mode==='public-speech'?'anonymous':'private',supported_formats:['wav'],accepted_audio_formats:['webm','mp4','m4a','wav']}}))})
}
export function SpeechReviewSimulation(){
  const [opened,setOpened]=useState(false),[draft,setDraft]=useState('Existing draft')
  return <><Button m="sm" onClick={()=>void configure('private').then(()=>{(window as any).__speechCalls=[];setOpened(true)})}>Test chat speech</Button>
    <AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title="Chat speech simulation"><Stack>
      <Group><Button onClick={()=>void configure('public-speech')}>Use non-private speech</Button><Button onClick={()=>void configure('private')}>Use private speech</Button><Button onClick={()=>void configure('e2ee')}>Use E2EE chat</Button></Group>
      <Textarea label="Speech draft" value={draft} onChange={event=>setDraft(event.currentTarget.value)}/>
      <Group><SpeechMicrophone client={client} context={{selected:{provider:'venice',modelId:'speech-chat'}}} onText={text=>setDraft(current=>current+'\n'+text)}/><SpeechReadAloud client={client} context={{selected:{provider:'venice',modelId:'speech-chat'}}} text={()=> '# A readable reply\n\nSynthetic speech test.'}/></Group>
    </Stack></AdaptiveModal>
  </>
}
