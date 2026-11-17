// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {useState} from 'react'
import type {SessionSettings,KnowledgeBase} from '@shared/types'
vi.mock('@/hooks/knowledge-base',()=>({useKnowledgeBases:()=>({data:[{id:-1,name:'Project'},{id:-2,name:'Policies'},{id:7,name:'Legacy docs'}]})}))
vi.mock('@/stores/uiStore',()=>({useUIStore:(select:any)=>select({newSessionState:{},sessionKnowledgeBaseMap:{}}),uiStore:{getState:()=>({})}}))
vi.mock('@/hooks/useSessionPresentation',()=>({useSessionPresentation:()=>({})}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{}}))
vi.mock('@/modals/settings-navigation',()=>({navigateToSettings:vi.fn()}))
vi.mock('./ChatKnowledgeReview',()=>({ChatKnowledgeReview:({value,onChange}:any)=><input type="checkbox" aria-label="Check answers against sources" checked={value?.enabled===true} onChange={()=>onChange({enabled:true})}/>}))
import {ChatKnowledgeSettings} from './ChatKnowledgeSettings'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});HTMLElement.prototype.scrollIntoView=vi.fn()})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('edits primary, additional collections and source review together without closing the panel',()=>{
 let current:Partial<SessionSettings>={},primary:KnowledgeBase|null=null
 function Harness(){const [settings,setSettings]=useState<Partial<SessionSettings>>({}),[selected,setSelected]=useState<KnowledgeBase|null>(null);return <ChatKnowledgeSettings sessionId="new" settings={settings} primaryId={selected?.id} onPrimarySelect={value=>{primary=value;setSelected(value)}} onChange={patch=>{current={...current,...patch};setSettings(current)}}/>}
 render(<MantineProvider><Harness/></MantineProvider>)
 fireEvent.click(screen.getByRole('textbox',{name:'Primary knowledge collection'}));fireEvent.click(screen.getByRole('option',{name:'Project'}));expect(primary).toMatchObject({id:-1})
 fireEvent.click(screen.getByRole('textbox',{name:'Additional knowledge collections'}));expect(screen.queryByRole('option',{name:'Project'})).toBeNull();expect(screen.queryByRole('option',{name:'Legacy docs'})).toBeNull();fireEvent.click(screen.getByRole('option',{name:'Policies'}));expect(current.knowledgeCollectionIds).toEqual([-2])
 fireEvent.click(screen.getByRole('checkbox',{name:'Check answers against sources'}));expect(current.knowledgeVerification).toMatchObject({enabled:true});expect(screen.getByTestId('chat-knowledge-settings')).toBeTruthy()
})
