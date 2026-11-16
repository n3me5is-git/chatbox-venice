// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {RagSettingsSchema} from '@shared/session-rag'
const state=vi.hoisted(()=>({addMany:vi.fn(),mount:vi.fn(),migrate:vi.fn(),directoryEntry:vi.fn(),remove:vi.fn(),list:vi.fn(),create:vi.fn(),data:vi.fn(),authorize:vi.fn(),configure:vi.fn(),index:vi.fn(),lock:vi.fn(),status:vi.fn(),locked:false,revision:0,notify:()=>{}}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>({defaultVirtualRerankModel:{provider:'private',model:'small-ranker'}})})}}))
vi.mock('@/platform',()=>({default:{type:'mobile'}}))
vi.mock('@/packages/session-rag/defaults',()=>({defaultRagSettings:()=>RagSettingsSchema.parse({provider:'venice',model:'private-embedding'})}))
vi.mock('@/packages/session-rag/embeddings',()=>({multimodalEmbedding:(provider:string)=>provider==='gemini',embeddingMediaSupport:(provider:string)=>({image:provider==='gemini',audio:provider==='gemini'})}))
vi.mock('@/packages/knowledge-collections/service',()=>({collectionDirectories:{mount:state.mount,migrate:state.migrate},knowledgeCollections:{addMany:state.addMany,remove:state.remove,directoryEntry:state.directoryEntry,list:state.list,create:state.create,data:state.data,authorize:state.authorize,configure:state.configure,index:state.index,indexStatus:state.status,assert:async()=>{if(state.locked)throw Error('Unlock')},running:()=>false,lock:state.lock,vault:{keys:{snapshot:()=>state.revision,subscribe:(callback:()=>void)=>{state.notify=callback;return()=>{}},isUnlocked:()=>!state.locked}}}}))
vi.mock('@/components/settings/SettingsLayout',()=>({SettingsPage:({children,action}:any)=><main>{action}{children}</main>}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:({opened,children}:any)=>opened?<div role="dialog">{children}</div>:null}))
vi.mock('@/packages/knowledge-collections/linked-folder',()=>({knowledgeFolderAvailable:()=>true}))
vi.mock('./CollectionFolder',()=>({CollectionFolder:()=>null}))
vi.mock('./CollectionProtection',()=>({CollectionProtection:()=>null}))
vi.mock('@/components/ModelSelectorV2',()=>({ModelSelectorV2:({children,onSelect}:any)=><div>{children}<button onClick={()=>onSelect('gemini','gemini-embedding-2')}>Use native multimodal</button></div>}))
import CollectionsPage from './CollectionsPage'
beforeEach(()=>{vi.clearAllMocks();state.mount.mockResolvedValue(-2);state.migrate.mockResolvedValue(undefined);state.directoryEntry.mockResolvedValue({directory:{uuid:'fixture'}});state.remove.mockResolvedValue(undefined);state.authorize.mockResolvedValue(undefined);state.locked=false;state.revision=0;const settings=RagSettingsSchema.parse({provider:'venice',model:'private-embedding',enabled:true});state.list.mockResolvedValue([]);state.create.mockResolvedValue(-1);state.data.mockResolvedValue({version:1,name:'Manuals',settings,files:[]});state.status.mockResolvedValue(null);Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const mount=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MantineProvider><CollectionsPage/></MantineProvider></QueryClientProvider>)
it('creates an encrypted collection on mobile only after explicit remote-processing consent',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'New collection'}));fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Manuals'}})
 expect((screen.getByRole('button',{name:'Create collection'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox',{name:/I allow/}));fireEvent.click(screen.getByRole('button',{name:'Create collection'}));await waitFor(()=>expect(state.create).toHaveBeenCalledWith('Manuals',expect.objectContaining({provider:'venice'})))
 expect(state.index).not.toHaveBeenCalled()
})
it('keeps native photos/audio independent from OCR and never enables them for text-only APIs',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'New collection'}));fireEvent.click(screen.getByRole('button',{name:'Document processing'}));expect((screen.getByRole('switch',{name:'Use text embeddings for media'}) as HTMLInputElement).disabled).toBe(true);expect(screen.queryByRole('checkbox',{name:'Index photos directly (no OCR)'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Use native multimodal'}));fireEvent.click(screen.getByRole('checkbox',{name:'Index photos directly (no OCR)'}));expect((screen.getByRole('checkbox',{name:'Index audio directly (no transcription)'}) as HTMLInputElement).checked).toBe(false);expect((screen.getByRole('switch',{name:'Optional OCR for images and scanned PDFs'}) as HTMLInputElement).checked).toBe(false)
})
it('requests owner authentication before loading a protected collection',async()=>{
 state.locked=true;state.list.mockResolvedValue([{id:-1,scope:'knowledge:-1',name:'Protected collection',locked:true}]);state.authorize.mockRejectedValue(Error('Knowledge collection access was declined'));mount();fireEvent.click(await screen.findByRole('button',{name:'Unlock'}));await screen.findByRole('alert');expect(state.authorize).toHaveBeenCalledWith(-1);expect(state.data).not.toHaveBeenCalled();expect(state.index).not.toHaveBeenCalled()
})

it('enables virtual reranking per collection with an explicit default model and renewed consent',async()=>{
 state.list.mockResolvedValue([{id:-1,scope:'public',name:'Manuals',locked:false}]);mount();fireEvent.click(await screen.findByRole('button',{name:'Open collection'}))
 fireEvent.click(await screen.findByRole('tab',{name:'Settings'}));fireEvent.click(screen.getByRole('button',{name:'Reranking (optional)'}))
 const mode=await screen.findByRole('switch',{name:'Virtual reranking with LLM'});expect((mode as HTMLInputElement).checked).toBe(false)
 fireEvent.click(mode);expect(await screen.findByRole('button',{name:'small-ranker'})).toBeTruthy();expect((screen.getByRole('button',{name:'Save settings'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox',{name:/I allow/}));fireEvent.click(screen.getByRole('button',{name:'Save settings'}))
 await waitFor(()=>expect(state.configure).toHaveBeenCalledWith(-1,'Manuals',expect.anything(),'private','small-ranker','llm',expect.objectContaining({retrievalMode:'semantic'})));expect(state.index).not.toHaveBeenCalled()
})

it('connects an existing folder from creation without creating another collection or requesting provider inference',async()=>{mount();fireEvent.click(screen.getByRole('button',{name:'New collection'}));fireEvent.click(screen.getByRole('radio',{name:'Connect existing'}));expect(screen.getByText(/Encrypted collections ask for a passphrase/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Choose folder'}));await waitFor(()=>expect(state.mount).toHaveBeenCalledWith(false));expect(state.create).not.toHaveBeenCalled();expect(state.index).not.toHaveBeenCalled()})
it('creates an explicitly public folder collection and never triggers indexing implicitly',async()=>{mount();fireEvent.click(screen.getByRole('button',{name:'New collection'}));fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Public docs'}});fireEvent.click(screen.getByRole('switch',{name:'Store this collection in a linked folder'}));fireEvent.click(screen.getByRole('switch',{name:'Encrypt the folder database'}));expect(screen.getByText(/Anyone with the folder/)).toBeTruthy();fireEvent.click(screen.getByRole('checkbox',{name:/I allow/}));fireEvent.click(screen.getByRole('button',{name:'Create collection'}));await waitFor(()=>expect(state.migrate).toHaveBeenCalledWith(-1,{encrypted:false}));expect(state.index).not.toHaveBeenCalled()})

it('opens documents first, retains draft settings between tabs and requires confirmation before leaving them',async()=>{
 state.list.mockResolvedValue([{id:-1,scope:'public',name:'Manuals',locked:false}]);mount();fireEvent.click(await screen.findByRole('button',{name:'Open collection'}))
 expect(await screen.findByTestId('collection-documents')).toBeTruthy();expect(screen.queryByRole('textbox',{name:'Collection name'})).toBeNull();expect(state.index).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('tab',{name:'Settings'}));fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Unsaved manuals'}})
 fireEvent.click(screen.getByRole('tab',{name:'Documents'}));expect(screen.getByText('Save your settings before updating the index.')).toBeTruthy();expect((screen.getByRole('button',{name:'Index now'}) as HTMLButtonElement).disabled).toBe(true)
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);fireEvent.click(screen.getByRole('button',{name:'Back to collections'}));expect(screen.getByTestId('collection-documents')).toBeTruthy()
 fireEvent.click(screen.getByRole('tab',{name:'Settings'}));expect((screen.getByRole('textbox',{name:'Collection name'}) as HTMLInputElement).value).toBe('Unsaved manuals')
 confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Back to collections'}));await screen.findByRole('button',{name:'Open collection'});expect(state.configure).not.toHaveBeenCalled();expect(state.index).not.toHaveBeenCalled();confirm.mockRestore()
})

it('keeps unsaved configuration when documents are added from the document tab',async()=>{
 state.list.mockResolvedValue([{id:-1,scope:'public',name:'Manuals',locked:false}]);mount();fireEvent.click(await screen.findByRole('button',{name:'Open collection'}));await screen.findByTestId('collection-documents')
 fireEvent.click(screen.getByRole('tab',{name:'Settings'}));fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'Pending title'}});fireEvent.click(screen.getByRole('tab',{name:'Documents'}))
 const file=new File(['New source'],'new.md',{type:'text/markdown'});fireEvent.change(screen.getByLabelText('Add documents',{selector:'input'}),{target:{files:[file]}})
 await waitFor(()=>expect(state.addMany).toHaveBeenCalledWith(-1,[file]));await waitFor(()=>expect(screen.queryByRole('status')).toBeNull())
 fireEvent.click(screen.getByRole('tab',{name:'Settings'}));expect((screen.getByRole('textbox',{name:'Collection name'}) as HTMLInputElement).value).toBe('Pending title');expect(state.configure).not.toHaveBeenCalled()
})
