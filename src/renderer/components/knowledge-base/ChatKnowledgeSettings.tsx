import {Alert,Button,MultiSelect,Select,Stack} from '@mantine/core'
import type {KnowledgeBase,SessionSettings} from '@shared/types'
import {useState} from 'react'
import {useKnowledgeBases} from '@/hooks/knowledge-base'
import {useUIStore,uiStore} from '@/stores/uiStore'
import {useSessionPresentation} from '@/hooks/useSessionPresentation'
import {rendererApplication} from '@/app/renderer-application'
import {navigateToSettings} from '@/modals/settings-navigation'
import {forkT as ft} from '@/i18n/fork'
import {ChatKnowledgeReview} from './ChatKnowledgeReview'

/** One editor is shared by the composer and session settings. */
export function ChatKnowledgeSettings({sessionId,settings,onChange,primaryId,onPrimarySelect}:{sessionId:string;settings?:SessionSettings;onChange:(patch:Partial<SessionSettings>)=>void;primaryId?:number;onPrimarySelect?:(kb:KnowledgeBase|null)=>void}){
 const {data:entries}=useKnowledgeBases(),primary=useUIStore(state=>sessionId==='new'?state.newSessionState.knowledgeBase:state.sessionKnowledgeBaseMap[sessionId])
 const selected=primaryId??primary?.id
 return <Stack gap="sm" data-testid="chat-knowledge-settings">
  <Select label={ft('Primary knowledge collection')} placeholder={ft('None')} clearable searchable comboboxProps={{withinPortal:false}} value={selected?String(selected):null} data={(entries||[]).map(kb=>({value:String(kb.id),label:kb.name+(kb.id>0?' · '+ft('Legacy'):'' )}))} onChange={value=>{const kb=entries?.find(item=>String(item.id)===value)||null;if(onPrimarySelect)onPrimarySelect(kb);else{const state=uiStore.getState();if(sessionId==='new')state.setNewSessionState(current=>({...current,knowledgeBase:kb||undefined}));else if(kb)state.addSessionKnowledgeBase(sessionId,kb);else state.removeSessionKnowledgeBase(sessionId)}}}/>
  <MultiSelect label={ft('Additional knowledge collections')} description={ft('Selected collections and source review apply to this chat. Use @ to reference a collection for one request.')} searchable clearable maxValues={7} comboboxProps={{withinPortal:false}} value={(settings?.knowledgeCollectionIds||[]).filter(id=>id!==selected).map(String)} data={(entries||[]).filter(kb=>kb.id<0&&kb.id!==selected).map(kb=>({value:String(kb.id),label:kb.name}))} onChange={values=>onChange({knowledgeCollectionIds:values.length?values.map(Number):undefined})}/>
  <ChatKnowledgeReview value={settings?.knowledgeVerification} onChange={knowledgeVerification=>onChange({knowledgeVerification})}/>
  <Button variant="subtle" onClick={()=>navigateToSettings('/knowledge-base')}>{ft('Manage collections')}</Button>
 </Stack>
}
export function SessionKnowledgeControl({sessionId,primaryId,onPrimarySelect}:{sessionId:string;primaryId?:number;onPrimarySelect:(kb:KnowledgeBase|null)=>void}){
 const {header}=useSessionPresentation(sessionId==='new'?null:sessionId),draft=useUIStore(state=>state.newSessionState),[error,setError]=useState('')
 return <Stack p="sm">{error&&<Alert color="red">{ft(error)}</Alert>}<ChatKnowledgeSettings sessionId={sessionId} primaryId={primaryId} onPrimarySelect={onPrimarySelect} settings={sessionId==='new'?{knowledgeCollectionIds:draft.knowledgeCollectionIds,knowledgeVerification:draft.knowledgeVerification}:header?.settings} onChange={patch=>{setError('');if(sessionId==='new'){uiStore.getState().setNewSessionState(current=>({...current,...patch}));return}void rendererApplication.sessions.updateSessionHeader(sessionId,current=>{if(!current)throw Error('Session not found');return{...current,settings:{...current.settings,...patch}}}).catch(error=>setError((error as Error).message))}}/></Stack>
}
