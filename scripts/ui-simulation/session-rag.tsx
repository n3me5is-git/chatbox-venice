import {Button} from '@mantine/core'
import {useState} from 'react'
import {AdaptiveModal} from '../../src/renderer/components/common/AdaptiveModal'
import {SessionRagPanel} from '../../src/renderer/components/session-resources/SessionRag'
import {SessionRagEngine} from '../../src/shared/session-rag-engine'
import {RagSettingsSchema,RAG_ROOT} from '../../src/shared/session-rag'
import {workspaceTestStore as store,workspaceTestAPI} from './session-workspace'
const id='rag-simulation'
let settings=RagSettingsSchema.parse({provider:'venice',model:'fixture-embedding'}),authorized=false
const json=async(path:string)=>{try{return JSON.parse(new TextDecoder().decode((await store.read(id,path)).bytes))}catch{return null}}
const engine=new SessionRagEngine({check:async()=>{},list:async()=>store.list(id),read:async path=>(await store.read(id,path)).bytes,get:json,put:async(path,value)=>{await store.write(id,path,new TextEncoder().encode(JSON.stringify(value)))},remove:async path=>{const item=(await store.list(id)).find(item=>item.path===path);if(item)await store.remove(id,item.id)},extract:async(_file,bytes)=>({text:new TextDecoder().decode(bytes)}),embed:async input=>input.map(item=>/solar|sun/i.test(item.text||'')?[1,0]:[0,1])})
const service={subscribeRag:()=>()=>{},ragJob:()=>undefined,ragStatus:async()=>({settings,authorized,index:await json(RAG_ROOT+'index.json')}),configureRag:async(_id:string,value:typeof settings)=>{settings=value;authorized=true;return value},indexSessionRag:()=>engine.index(settings,new AbortController().signal),cancelSessionRag:()=>{},clearSessionRag:async()=>{},searchSessionRag:(_id:string,query:string,signal:AbortSignal)=>engine.search(query,settings,signal)}
export function SessionRagSimulation(){const [opened,setOpened]=useState(false);const open=async()=>{await store.write(id,'docs/energy.md',new TextEncoder().encode('# Solar energy\n\nSolar panels convert sunlight into electrical energy.'));await store.write(id,'docs/other.md',new TextEncoder().encode('Bicycles are useful in cities.'));setOpened(true)};return <><Button m="sm" onClick={()=>void open()}>Test session RAG</Button><AdaptiveModal opened={opened} onClose={()=>setOpened(false)} title="Session RAG simulation" size="lg"><SessionRagPanel sessionId={id} service={service as any} resourceAPI={workspaceTestAPI}/></AdaptiveModal></>}
