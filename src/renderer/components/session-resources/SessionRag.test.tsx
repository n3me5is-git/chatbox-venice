// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { RagSettingsSchema } from '@shared/session-rag'
vi.mock('@/packages/session-rag/service',()=>({}))
vi.mock('@/packages/session-rag/embeddings',()=>({multimodalEmbedding:(p:string,m:string)=>p==='gemini'&&m==='gemini-embedding-2'}))
vi.mock('@/packages/session-resources/linked-folder',()=>({linkedFolderAvailable:()=>false,linkedFolderOperation:async()=>({linked:false})}))
vi.mock('./SessionResources',()=>({SessionResources:({initialPath}:{initialPath:string})=><div>Preview: {initialPath}</div>}))
vi.mock('@/components/ModelSelectorV2',()=>({ModelSelectorV2:({onSelect,children}:any)=><div>{children}<button onClick={()=>onSelect('gemini','gemini-embedding-2')}>Select multimodal embedding</button></div>}))
import { SessionRagPanel } from './SessionRag'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('requires explicit provider consent, persists separate modalities, indexes and opens semantic source previews',async()=>{
 let settings=RagSettingsSchema.parse({provider:'venice',model:'text-embedding'}),authorized=false
 const api={subscribeRag:()=>()=>{},ragJob:()=>undefined,ragStatus:vi.fn(async()=>({settings,index:null,authorized})),configureRag:vi.fn(async(_id,value)=>{settings=value;authorized=true}),indexSessionRag:vi.fn(),cancelSessionRag:vi.fn(),clearSessionRag:vi.fn(),searchSessionRag:vi.fn(async()=>({matches:[{id:'hit',path:'notes.md',line:2,endLine:3,snippet:'Relevant source'}],stale:false}))}
 render(<MantineProvider><SessionRagPanel sessionId="chat" service={api as any}/></MantineProvider>)
 await screen.findByRole('switch',{name:'Enable session RAG'})
 expect((screen.getByRole('checkbox',{name:'Embed photos directly'}) as HTMLInputElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('switch',{name:'Enable session RAG'}))
 expect((screen.getByRole('button',{name:'Save RAG settings'}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Select multimodal embedding'}));fireEvent.click(screen.getByRole('checkbox',{name:'Embed photos directly'}))
 expect((screen.getByRole('checkbox',{name:'Embed audio directly'}) as HTMLInputElement).checked).toBe(false)
 fireEvent.click(screen.getByRole('switch',{name:/^Automatically update changed files/}));fireEvent.click(screen.getByRole('checkbox',{name:/I allow the selected/}));fireEvent.click(screen.getByRole('button',{name:'Save RAG settings'}))
 await waitFor(()=>expect(api.configureRag).toHaveBeenCalledWith('chat',expect.objectContaining({enabled:true,auto:true,images:true,audio:false,ocr:false,provider:'gemini'})))
 await waitFor(()=>expect((screen.getByRole('button',{name:'Index now'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Index now'}));await waitFor(()=>expect(api.indexSessionRag).toHaveBeenCalledWith('chat'))
 fireEvent.change(screen.getByRole('textbox',{name:'Try semantic search'}),{target:{value:'find a note'}});await waitFor(()=>expect((screen.getByRole('button',{name:'Search indexed files'}) as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Search indexed files'}))
 fireEvent.click(await screen.findByRole('button',{name:/notes.md/}));await screen.findByText('Preview: notes.md')
})
it('surfaces errors without losing controls for clearing a corrupt local index',async()=>{
 const api={subscribeRag:()=>()=>{},ragJob:()=>undefined,ragStatus:async()=>({settings:RagSettingsSchema.parse({}),index:null,authorized:false,error:'Invalid RAG index'}),clearSessionRag:vi.fn()}
 vi.spyOn(window,'confirm').mockReturnValue(true)
 render(<MantineProvider><SessionRagPanel sessionId="chat" service={api as any}/></MantineProvider>)
 await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Clear index'}));await waitFor(()=>expect(api.clearSessionRag).toHaveBeenCalledWith('chat'));vi.restoreAllMocks()
})
