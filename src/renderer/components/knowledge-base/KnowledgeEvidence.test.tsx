// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('@/platform',()=>({default:{type:'mobile',isDesktopLike:false}}))
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:{}}))
import {KnowledgeEvidencePanel} from './KnowledgeEvidence'
let revision=0,notify=()=>{}
const source={version:1,id:'a'.repeat(64),collectionId:-1,fileId:10,name:'private.txt',sourceHash:'b'.repeat(64),quote:'Private evidence.',before:'Context before.',after:'Context after.',line:3,endLine:3,created:1,stale:false}
const store={authorize:vi.fn(),assert:vi.fn(),readEvidence:vi.fn(),documentText:vi.fn(),vault:{keys:{snapshot:()=>revision,subscribe:(fn:()=>void)=>{notify=fn;return()=>{}}}}}
beforeEach(()=>{vi.clearAllMocks();revision=0;store.authorize.mockResolvedValue(undefined);store.assert.mockResolvedValue(undefined);store.readEvidence.mockResolvedValue(source);store.documentText.mockResolvedValue({text:'Context before.\nPrivate evidence.\nContext after.',sourceHash:source.sourceHash,textHash:'c'.repeat(64)});Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const mount=()=>render(<MantineProvider><KnowledgeEvidencePanel collectionId={-1} fileId={10} id={source.id} store={store as never}/></MantineProvider>)
it('shows exact quote and context only after owner authentication and opens local parsed text on demand',async()=>{
 let allow!:()=>void;store.authorize.mockReturnValueOnce(new Promise<void>(resolve=>{allow=resolve}));mount();expect(screen.queryByText('Private evidence.')).toBeNull();expect(store.readEvidence).not.toHaveBeenCalled();await act(async()=>allow());expect(await screen.findByText('Private evidence.')).toBeTruthy();expect(screen.getByText('Context before.')).toBeTruthy();expect(store.documentText).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Open parsed document'}));await screen.findByRole('region',{name:'Parsed document'});expect(store.documentText).toHaveBeenCalledWith(-1,10,expect.any(AbortSignal));expect(screen.queryByRole('button',{name:'Preview original'})).toBeNull()
})
it('labels historical source revisions and removes decrypted content immediately when collection keys change',async()=>{
 store.readEvidence.mockResolvedValue({...source,stale:true});mount();await screen.findByText('Private evidence.');expect((screen.getByRole('button',{name:'Open parsed document'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText(/The source has changed/)).toBeTruthy();store.authorize.mockRejectedValue(Error('Unlock required'));await act(async()=>{revision++;notify()});await waitFor(()=>expect(screen.queryByText('Private evidence.')).toBeNull());expect(await screen.findByRole('alert')).toBeTruthy()
})
