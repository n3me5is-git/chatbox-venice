import { SearchReviewSimulation } from './search-review'
import { ImageReviewSimulation } from './image-review'
import {MobileReviewSimulation} from './mobile-review'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
const testQueryClient=new QueryClient()
import { SecuritySimulation } from './security'
import { showImageEdit,checkLocalMask } from './image-edit'
import type {ImageChoice} from '../../src/shared/providers/definitions/models/venice/image-tools'
import type {ApprovalMode} from '../../src/renderer/packages/venice/session-approvals'
import i18n from '../../src/renderer/i18n'
import {requestSessionImageChoice} from '../../src/renderer/packages/venice/image-approval'
import {sessionApprovals} from '../../src/renderer/packages/venice/session-approvals'
import {VeniceSessionApprovals} from '../../src/renderer/components/venice/VeniceSessionApprovals'
import '../../src/renderer/static/globals.css'
import '../../src/renderer/static/index.css'
import NiceModal from '@ebay/nice-modal-react'
import { VeniceImageApproval } from '../../src/renderer/components/venice/VeniceImageApproval'
import '@mantine/core/styles.css'
import { Button, Checkbox, MantineProvider } from '@mantine/core'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { VeniceStudio } from '../../src/renderer/components/venice/VeniceStudio'
import { VeniceMediaService, type MediaRecord } from '../../src/shared/providers/definitions/models/venice/media'
let records: MediaRecord[] = []; const blobs = new Map<string, string>()
const configuration = { apiKey: 'SIMULATED-NOT-A-REAL-KEY', options: { audioEnabled: true, videoEnabled: true, musicEnabled: true } }
const wav = new Uint8Array(2044); const header = new DataView(wav.buffer)
const ascii = (at: number, text: string) => [...text].forEach((letter, i) => { wav[at + i] = letter.charCodeAt(0) })
ascii(0, 'RIFF'); header.setUint32(4, wav.length - 8, true); ascii(8, 'WAVEfmt '); header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true); header.setUint32(24, 8000, true); header.setUint32(28, 16000, true); header.setUint16(32, 2, true); header.setUint16(34, 16, true); ascii(36, 'data'); header.setUint32(40, wav.length - 44, true)
const service = new VeniceMediaService({ read: async () => structuredClone(records), write: async value => { records = structuredClone(value) }, putBlob: async (id, value) => { blobs.set(id, value) }, getBlob: async id => blobs.get(id) || null, deleteBlob: async id => { blobs.delete(id) } }, () => configuration, async request => {
  (window as any).__simulationRequestCount = ((window as any).__simulationRequestCount || 0) + 1
  const path = new URL(request.url).pathname
  if (path.endsWith('/models')) return Response.json({ data: [{ id: 'tts-kokoro', type: 'tts', model_spec: { name: 'Kokoro', voices: ['if_sara', 'im_nicola'], default_voice: 'if_sara', supported_formats: ['mp3', 'wav'], default_format: 'mp3' } }] })
  if (path.endsWith('/audio/speech')) {
    (window as any).__simulationLastBody = JSON.parse(String(request.body))
    if (String(request.body).includes('SIMULATE_ERROR')) return new Response('', { status: 429 })
    return new Response(wav, { headers: { 'content-type': 'audio/wav' } })
  }
  throw new Error('Unexpected simulated request: ' + path)
})
const imageModels = [{modelId:'gpt-flare-image',displayName:'GPT Flare',capabilities:{aspectRatio:{values:['1:1','16:9']},inputReferences:null},vendorMetadata:{privacy:'anonymized'}}]
;(window as any).__simulationSetLanguage=(language:string)=>i18n.changeLanguage(language)
function Simulation() {
 const [enabled,setEnabled]=useState(true),[security,setSecurity]=useState(false)
 ;(window as any).__simulationCheckLocalMask=checkLocalMask
 const chooseImage=async()=>{
  const count=((window as any).__simulationImageAttempt||0)+1; (window as any).__simulationImageAttempt=count
  ;(window as any).__simulationImageChoice=null
  const result=await requestSessionImageChoice('simulation-chat',{prompt:count===1?'A sunset by the sea':'Another sunset with different colors',count:1},imageModels,async request=>{
   ;(window as any).__simulationImageDialogs=((window as any).__simulationImageDialogs||0)+1
   return await NiceModal.show(VeniceImageApproval,{models:imageModels,request,sessionId:'simulation-chat'}) as ImageChoice & {approvalMode?:ApprovalMode} | null
  })
  ;(window as any).__simulationImageChoice=result?.choice; (window as any).__simulationImageAutomatic=result?.automatic
  ;(window as any).__simulationOtherChatMode=sessionApprovals.mode('other-chat')
 }
 return <QueryClientProvider client={testQueryClient}><MantineProvider><NiceModal.Provider><ImageReviewSimulation/><MobileReviewSimulation/><SearchReviewSimulation/><div style={{padding:12,background:'#fff3bf'}}>Local simulation: no real APIs or charges.<Checkbox label="Audio module enabled (simulation)" checked={enabled} onChange={e=>{const value=e.currentTarget.checked;configuration.options.audioEnabled=value;setEnabled(value)}}/></div><Button m="sm" onClick={()=>void showImageEdit()}>Test image editing</Button><Button m="sm" onClick={()=>setSecurity(value=>!value)}>Test privacy settings</Button>{security&&<SecuritySimulation/>}<Button m="sm" variant="light" onClick={()=>void chooseImage()}>Test image selection</Button><div style={{padding:12}}><VeniceSessionApprovals sessionId="simulation-chat"/></div><VeniceStudio service={service} options={{...configuration.options,audioEnabled:enabled}}/></NiceModal.Provider></MantineProvider></QueryClientProvider>
}
void i18n.changeLanguage('en').then(()=>createRoot(document.getElementById('root')!).render(<Simulation/>))
