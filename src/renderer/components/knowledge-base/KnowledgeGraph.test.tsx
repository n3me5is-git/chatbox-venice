// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
const open=vi.hoisted(()=>vi.fn())
vi.mock('./KnowledgeEvidence',()=>({openKnowledgeEvidence:open}))
import {KnowledgeGraph} from './KnowledgeGraph'
afterEach(cleanup)
it('loads metadata without inference, preserves cross-type relations and opens source-bound evidence',async()=>{
 Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 const anchor={start:0,end:31,quote:'Project Aurora has client Acme.'},row={fileId:'10',sourceHash:'a'.repeat(64),textHash:'b'.repeat(64),entities:[{id:'project',name:'Project Aurora',type:'project'},{id:'client',name:'Acme',type:'client'}],relations:[{subject:'project',object:'client',predicate:'has client',subjectName:'Project Aurora',objectName:'Acme',subjectType:'project',objectType:'client',anchor}],tags:[],summary:'',nextDetailOffset:null},store={metadata:vi.fn(async()=>({results:[row],stale:[],nextOffset:null})),assert:vi.fn(),citeAnchors:vi.fn(async()=>[{id:'receipt'}]),vault:{keys:{snapshot:()=>0,subscribe:()=>()=>{}}}}
 render(<MantineProvider><KnowledgeGraph store={store as never} id={-1}/></MantineProvider>);expect(store.metadata).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Load graph'}));await screen.findByRole('button',{name:'Acme · client'});fireEvent.click(screen.getByRole('button',{name:'Acme · client'}));fireEvent.click(screen.getByRole('button',{name:'Inspect source'}));await waitFor(()=>expect(open).toHaveBeenCalledWith({collectionId:-1,fileId:10,id:'receipt'}));expect(store.citeAnchors).toHaveBeenCalledWith(-1,[{fileId:10,sourceHash:row.sourceHash,textHash:row.textHash,start:0,end:31}],expect.any(AbortSignal));vi.unstubAllGlobals()
})
