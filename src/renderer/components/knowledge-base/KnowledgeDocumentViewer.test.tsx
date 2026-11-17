// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('@/components/common/PdfDocumentViewer',()=>({PdfDocumentViewer:()=> <div>Original PDF</div>}))
vi.mock('@/components/common/OfficeDocumentViewer',()=>({OfficeDocumentViewer:()=> <div>Office preview</div>}))
import {KnowledgeDocumentViewer} from './KnowledgeDocumentViewer'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});const BaseURL=URL;vi.stubGlobal('URL',class extends BaseURL{static createObjectURL=vi.fn(()=> 'blob:original');static revokeObjectURL=vi.fn()})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
function fixture(){let resolve!:(value:{text:string})=>void;const text=new Promise<{text:string}>(done=>{resolve=done});return {resolve,store:{vault:{keys:{snapshot:()=>0,subscribe:()=>()=>{}}},assert:async()=>{},data:async()=>({files:[{id:1,path:'report.pdf',name:'report.pdf',mime:'application/pdf'}]}),source:async()=>new Uint8Array([1,2,3]),documentText:vi.fn(()=>text)} as any}}
it('opens extracted text only after an explicit request',async()=>{const f=fixture(),onText=vi.fn();render(<MantineProvider><KnowledgeDocumentViewer store={f.store} id={1} fileId={1} onText={onText}/></MantineProvider>);await screen.findByText('Original PDF');expect(f.store.documentText).not.toHaveBeenCalled();fireEvent.click(screen.getByText('View extracted text'));await act(async()=>f.resolve({text:'Parsed source'}));expect(onText).toHaveBeenCalledWith('Parsed source')})
it('does not reopen a parsed-text panel after the user closes its pending viewer',async()=>{const f=fixture(),onText=vi.fn(),view=render(<MantineProvider><KnowledgeDocumentViewer store={f.store} id={1} fileId={1} onText={onText}/></MantineProvider>);await screen.findByText('Original PDF');fireEvent.click(screen.getByText('View extracted text'));view.unmount();await act(async()=>f.resolve({text:'Late source'}));expect(onText).not.toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original')})
