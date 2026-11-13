// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {RagSettingsSchema} from '@shared/session-rag'
const state=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),data:vi.fn(),authorize:vi.fn(),configure:vi.fn(),index:vi.fn(),lock:vi.fn(),status:vi.fn(),locked:false,revision:0,notify:()=>{}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>({defaultVirtualRerankModel:{provider:'private',model:'small-ranker'}})})}}))
vi.mock('@/platform',()=>({default:{type:'mobile'}}))
vi.mock('@/packages/session-rag/defaults',()=>({defaultRagSettings:()=>RagSettingsSchema.parse({provider:'venice',model:'private-embedding'})}))
vi.mock('@/packages/session-rag/embeddings',()=>({multimodalEmbedding:(provider:string)=>provider==='gemini',embeddingMediaSupport:(provider:string)=>({image:provider==='gemini',audio:provider==='gemini'})}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:{list:state.list,create:state.create,data:state.data,authorize:state.authorize,configure:state.configure,index:state.index,indexStatus:state.status,assert:async()=>{if(state.locked)throw Error('Unlock')},running:()=>false,lock:state.lock,vault:{keys:{snapshot:()=>state.revision,subscribe:(callback:()=>void)=>{state.notify=callback;return()=>{}},isUnlocked:()=>!state.locked}}}}))
vi.mock('@/components/settings/SettingsLayout',()=>({SettingsPage:({children,action}:any)=><main>{action}{children}</main>}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:({opened,children}:any)=>opened?<div role="dialog">{children}</div>:null}))
vi.mock('./CollectionProtection',()=>({CollectionProtection:()=>null}))
vi.mock('@/components/ModelSelectorV2',()=>({ModelSelectorV2:({children,onSelect}:any)=><div>{children}<button onClick={()=>onSelect('gemini','gemini-embedding-2')}>Use native multimodal</button></div>}))
import CollectionsPage from './CollectionsPage'
beforeEach(()=>{vi.clearAllMocks();state.authorize.mockResolvedValue(undefined);state.locked=false;state.revision=0;const settings=RagSettingsSchema.parse({provider:'venice',model:'private-embedding',enabled:true});state.list.mockResolvedValue([]);state.create.mockResolvedValue(-1);state.data.mockResolvedValue({version:1,name:'Manuals',settings,files:[]});state.status.mockResolvedValue(null);Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const mount=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MantineProvider><CollectionsPage/></MantineProvider></QueryClientProvider>)
it('creates an encrypted collection on mobile only after explicit remote-processing consent',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'New collection'}));fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Manuals'}})
 expect((screen.getByRole('button',{name:'Create collection'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox',{name:/I allow/}));fireEvent.click(screen.getByRole('button',{name:'Create collection'}));await waitFor(()=>expect(state.create).toHaveBeenCalledWith('Manuals',expect.objectContaining({provider:'venice'})))
 expect(state.index).not.toHaveBeenCalled()
})
it('keeps native photos/audio independent from OCR and never enables them for text-only APIs',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'New collection'}));expect((screen.getByRole('checkbox',{name:'Index photos directly (no OCR)'}) as HTMLInputElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Use native multimodal'}));fireEvent.click(screen.getByRole('switch',{name:'Index photos directly (no OCR)'}));expect((screen.getByRole('checkbox',{name:'Index audio directly (no transcription)'}) as HTMLInputElement).checked).toBe(false);expect((screen.getByRole('switch',{name:'Optional OCR for images and scanned PDFs'}) as HTMLInputElement).checked).toBe(false)
})
it('requests owner authentication before loading a protected collection',async()=>{
 state.locked=true;state.list.mockResolvedValue([{id:-1,scope:'knowledge:-1',name:'Protected collection',locked:true}]);state.authorize.mockRejectedValue(Error('Knowledge collection access was declined'));mount();fireEvent.click(await screen.findByRole('button',{name:'Unlock'}));await screen.findByRole('alert');expect(state.authorize).toHaveBeenCalledWith(-1);expect(state.data).not.toHaveBeenCalled();expect(state.index).not.toHaveBeenCalled()
})

it('enables virtual reranking per collection with an explicit default model and renewed consent',async()=>{
 state.list.mockResolvedValue([{id:-1,scope:'public',name:'Manuals',locked:false}]);mount();fireEvent.click(await screen.findByRole('button',{name:'Open collection'}))
 const mode=await screen.findByRole('switch',{name:'Virtual reranking with LLM'});expect((mode as HTMLInputElement).checked).toBe(false)
 fireEvent.click(mode);expect(await screen.findByRole('button',{name:'small-ranker'})).toBeTruthy();expect((screen.getByRole('button',{name:'Save settings'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox',{name:/I allow/}));fireEvent.click(screen.getByRole('button',{name:'Save settings'}))
 await waitFor(()=>expect(state.configure).toHaveBeenCalledWith(-1,'Manuals',expect.anything(),'private','small-ranker','llm',expect.objectContaining({retrievalMode:'semantic'})));expect(state.index).not.toHaveBeenCalled()
})
