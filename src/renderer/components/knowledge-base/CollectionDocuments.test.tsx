// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {RagSettingsSchema} from '@shared/session-rag'
vi.mock('./IndexingBackgroundSettings',()=>({IndexingBackgroundSettings:()=>null}))
vi.mock('@/components/common/OfficeDocumentViewer',()=>({isOfficePreview:()=>false}))
import {CollectionDocuments} from './CollectionDocuments'
beforeEach(()=>Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})}))
afterEach(cleanup)
it.each([{busy:false,readOnly:false,accepted:true},{busy:true,readOnly:false,accepted:false},{busy:false,readOnly:true,accepted:false}])('accepts desktop file drops only into a writable idle collection: %j',({busy,readOnly,accepted})=>{
 const addFiles=vi.fn(),file=new File(['Quarterly results'],'report.md',{type:'text/markdown'}),dataTransfer={types:['Files'],files:[file],dropEffect:'none'}
 render(<MantineProvider><CollectionDocuments id={-1} data={{version:1,name:'Reports',settings:RagSettingsSchema.parse({}),files:[]}} index={null} busy={busy} readOnly={readOnly} dirty={false} store={{vault:{},running:()=>false} as never} run={vi.fn()} reload={vi.fn()} addFiles={addFiles} onPreview={vi.fn()} onSettings={vi.fn()} onReadSource={vi.fn()} onProgress={vi.fn()}/></MantineProvider>)
 const target=screen.getByTestId('collection-documents');fireEvent.dragEnter(target,{dataTransfer});fireEvent.dragOver(target,{dataTransfer});expect(dataTransfer.dropEffect).toBe(accepted?'copy':'none');fireEvent.drop(target,{dataTransfer});expect(addFiles.mock.calls).toEqual(accepted?[[[file]]]:[])
 fireEvent.drop(target,{dataTransfer:{types:['text/plain'],files:[file]}});expect(addFiles).toHaveBeenCalledTimes(accepted?1:0)
})
