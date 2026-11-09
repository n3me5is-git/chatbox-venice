import React,{useEffect,useState,useSyncExternalStore} from 'react'
import {createRoot} from 'react-dom/client'
import {MantineProvider} from '@mantine/core'
import NiceModal from '@ebay/nice-modal-react'
import i18n from 'i18next'
import {initReactI18next} from 'react-i18next'
import {translationResources} from '../../packages/chatbox-i18n/src'
import {CollaborationContent} from '../../src/renderer/components/collaboration/CollaborationPanel'
import '@mantine/core/styles.css'
import {CatalogReview} from './CatalogReview'
import {RemoteChat} from '../../src/renderer/components/collaboration/RemoteChat'
import {collaboration} from './runtime'
await i18n.use(initReactI18next).init({lng:'en',fallbackLng:'en',resources:translationResources,interpolation:{escapeValue:false}})
const mode=new URLSearchParams(location.search).get('mode')
function Fixture(){
  const [remote,setRemote]=useState('');useSyncExternalStore(collaboration.subscribe,collaboration.getVersion)
  useEffect(()=>{const open=(event:Event)=>setRemote((event as CustomEvent).detail);window.addEventListener('fixture:open-remote',open);return()=>window.removeEventListener('fixture:open-remote',open)},[])
  return remote?<div style={{height:'100dvh',display:'flex',flexDirection:'column'}}><nav style={{padding:4,display:'flex',gap:8,overflowX:'auto',flexShrink:0}}>{[...collaboration.guests.values()].map(room=><button key={room.id} data-remote-session={room.id} onClick={()=>setRemote(room.id)}>☁ {room.snapshot?.title||'Remote chat'}</button>)}</nav><div style={{flex:1,minHeight:0}}><RemoteChat key={remote} roomId={remote} onManage={()=>setRemote('')} onLeave={()=>setRemote('')}/></div></div>:<main style={{padding:16,maxWidth:900,margin:'auto',height:'100dvh',overflowY:'auto',boxSizing:'border-box'}}>{mode==='catalog'?<CatalogReview/>:<CollaborationContent sessionId={mode==='host'?'demo':undefined}/>}</main>
}
document.body.style.margin='0'
createRoot(document.getElementById('root')!).render(<MantineProvider><NiceModal.Provider><Fixture/></NiceModal.Provider></MantineProvider>)
