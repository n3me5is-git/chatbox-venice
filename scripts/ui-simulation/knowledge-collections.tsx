import NiceModal,{useModal} from '@ebay/nice-modal-react'
import {Button,Stack} from '@mantine/core'
import {useState} from 'react'
import {KnowledgeCollections} from '../../src/renderer/packages/knowledge-collections/store'
import {VaultDatabase} from '../../src/renderer/packages/vault/database'
import {VaultKeys} from '../../src/renderer/packages/vault/keys'
import {EncryptedChunkStore} from '../../src/renderer/packages/vault/chunk-store'
import type {VaultRuntime} from '../../src/renderer/packages/vault/runtime'
import {RagSettingsSchema} from '../../src/shared/session-rag'
import CollectionsPage from '../../src/renderer/components/knowledge-base/CollectionsPage'
import {AdaptiveModal} from '../../src/renderer/components/common/AdaptiveModal'
import {ScopeUnlock} from '../../src/renderer/components/security/ScopeUnlock'
const blobs=new Map<string,string>(),envelopes=new Map<string,string>(),db=new VaultDatabase('knowledge-simulation'),keys=new VaultKeys(db,{capabilities:async()=>({encryption:true,biometric:true,name:'Simulated device'}),protect:async value=>{const id=crypto.randomUUID();envelopes.set(id,value);return id},unprotect:async id=>{const value=envelopes.get(id);if(!value)throw Error('Device key missing');return value}})
const assets=new EncryptedChunkStore({get:async key=>blobs.get(key)||null,set:async(key,value)=>{blobs.set(key,value)},remove:async key=>{blobs.delete(key)},keys:async()=>[...blobs.keys()]},db,scope=>keys.key(scope))
const Unlock=NiceModal.create(({scope}:{scope:string})=>{const modal=useModal();return <AdaptiveModal opened={modal.visible} onClose={()=>{modal.resolve(false);modal.hide()}} title="Unlock protected content"><ScopeUnlock keys={keys} scope={scope} onUnlocked={()=>{modal.resolve(true);modal.hide()}}/></AdaptiveModal>})
const runtime={db,keys,assets,projects:{assertApp:async()=>{}},available:async()=>{await keys.key('public');return true}} as unknown as VaultRuntime
const store=new KnowledgeCollections(runtime,{validate:()=>{},extract:async(_source,bytes)=>({text:new TextDecoder().decode(bytes)}),embed:async inputs=>inputs.map(input=>/solar|sun/i.test(input.text||'')?[1,0]:[0,1]),unlock:async scope=>await NiceModal.show(Unlock,{scope}) as boolean})
let collection:number|undefined
export function KnowledgeCollectionsSimulation(){const [open,setOpen]=useState(false);const show=async()=>{if(!collection){collection=await store.create('Local manuals',RagSettingsSchema.parse({provider:'venice',model:'fixture-private-embedding',enabled:true}));await store.add(collection,new File(['# Solar instructions\n\nPrivate solar panel maintenance manual.'],'solar.md',{type:'text/markdown'}))}
 ;(window as any).__knowledgeCiphertext=()=>JSON.stringify([...blobs]);(window as any).__knowledgeTool=async()=>{await store.authorize(collection!);const result=await store.search(collection!,'solar');(window as any).__knowledgeAuthorized=result.matches.length};setOpen(true)}
 return <><Button m="sm" onClick={()=>void show()}>Test knowledge collections</Button><AdaptiveModal opened={open} onClose={()=>setOpen(false)} title="Knowledge collections simulation" size="xl"><Stack><CollectionsPage service={store}/></Stack></AdaptiveModal></>
}
