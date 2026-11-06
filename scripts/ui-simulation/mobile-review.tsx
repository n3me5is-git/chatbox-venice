import {Button,NumberInput,Stack,Text} from '@mantine/core'
import {useState} from 'react'
import {AdaptiveModal} from '../../src/renderer/components/common/AdaptiveModal'
import {ProjectProtectionMode} from '../../src/renderer/components/security/ProjectProtectionMode'
import {ImagePromptField} from '../../src/renderer/components/venice/ImagePromptField'
import {VeniceModelSelect} from '../../src/renderer/components/venice/VeniceModelSelect'
import {VeniceModelInfo} from '../../src/renderer/components/venice/VeniceModelInfo'
import {HistoryItem} from '../../src/renderer/routes/image-creator/-components/HistoryItem'
import {LocalMediaBrowser} from '../../src/renderer/components/local-library/LocalMediaBrowser'
import {closeTopSurface} from '../../src/renderer/packages/overlay-back'
import {vaultRuntimeFor} from '../../src/renderer/packages/vault/runtime'
import {dataUrlBytes} from '../../src/renderer/packages/vault/chunk-store'
import platform from './platform'
const models=[{id:'private-secure',type:'text',model_spec:{name:'Private secure model',privacy:'private',uncensored:true,capabilities:{supportsE2EE:true,supportsTeeAttestation:true},pricing:{input:{usd:0.2,diem:0.2},output:{usd:0.5,diem:0.5}},constraints:{durations:['5s','10s'],maxInputImages:3}}},{id:'anonymous-image',type:'image',model_spec:{name:'Anonymous image model',privacy:'anonymized',uncensored:false}}]
let initialized:Promise<void>|undefined
async function seedLibrary(){
 const envelopes=new Map<string,string>(),vault=vaultRuntimeFor(platform as any,{databaseName:'mobile-review-library',device:{capabilities:async()=>({encryption:true,biometric:false,name:'Simulated device key'}),protect:async value=>{const id=crypto.randomUUID();envelopes.set(id,value);return id},unprotect:async id=>{const value=envelopes.get(id);if(!value)throw Error('Missing simulated key');return value}}})
 Object.assign(vault,{projects:{assertApp:async()=>{},libraryKeyVisible:async()=>true,assertLibraryKey:async()=>{}},media:{get:async(id:string)=>id==='music-record'?{kind:'music'}:null}})
 await vault.keys.configure('app',{pin:'123456',biometric:false})
 const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const context=canvas.getContext('2d')!;context.fillStyle='#ff9900';context.fillRect(0,0,160,120)
 await vault.assets.put(dataUrlBytes(canvas.toDataURL('image/png')),{name:'Local orange landscape',mime:'image/png',kind:'image'},'public','review-image')
 await vault.assets.put(dataUrlBytes('data:audio/wav;base64,UklGRg=='),{name:'Local music sample',mime:'audio/wav',kind:'audio',sourceId:'music-record'},'public','review-music')
 vault.keys.lock('app')
}
export function MobileReviewSimulation(){
 const [opened,setOpened]=useState(false),[mode,setMode]=useState('none'),[model,setModel]=useState<string|null>('private-secure'),[prompt,setPrompt]=useState(''),[library,setLibrary]=useState(false)
 ;(window as any).__simulationBack=closeTopSurface
 return <><Button m="sm" onClick={()=>setOpened(true)}>Test reported mobile issues</Button><Button m="sm" onClick={async()=>{await (initialized||=seedLibrary());setLibrary(true)}}>Test visual library</Button>
 <AdaptiveModal opened={library} onClose={()=>setLibrary(false)} title="Visual library regression" size="xl"><LocalMediaBrowser browse/></AdaptiveModal>
 <AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title="Reported mobile issues" size="lg"><Stack>
 <ProjectProtectionMode value={mode} onChange={value=>{setMode(value);(window as any).__simulationProjectMode=value}}/>
 <VeniceModelSelect label="Catalog model" models={models} value={model} onChange={setModel}/>
 <VeniceModelInfo model={models.find(item=>item.id===model)}/>
 <ImagePromptField label="Paid image prompt" value={prompt} onChange={event=>setPrompt(event.currentTarget.value)} minRows={3}/>
 <Button onClick={()=>{(window as any).__simulationExplicitImages=((window as any).__simulationExplicitImages||0)+1}}>Explicit image generation</Button>
 <HistoryItem record={{id:'review-history',createdAt:1,prompt:'History context action test',model:{provider:'venice',modelId:'image'},referenceImages:[],generatedImages:[],status:'done'}} isActive={false} isMobile modelDisplayName="Venice image" onClick={()=>{}} onDelete={()=>{}}/>
 {Array.from({length:12},(_,i)=><NumberInput key={i} label={'Allowed option '+(i+1)} min={0} max={10}/>)}
 <Text>Bottom of scrollable panel</Text><Button onClick={()=>setOpened(false)}>Close reported issues</Button>
 </Stack></AdaptiveModal></>
}
