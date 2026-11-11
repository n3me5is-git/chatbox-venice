// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({page:vi.fn(),file:vi.fn(),choose:vi.fn(),keys:{subscribe:()=>()=>{},snapshot:()=>0,isUnlocked:()=>true}}))
vi.mock('@/platform',()=>({default:{}}))
vi.mock('@/packages/local-library',()=>({acceptsLocalFile:()=>true,localLibraryPage:mocks.page,localLibraryFile:mocks.file,moveLibraryItem:vi.fn()}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({keys:mocks.keys})}))
vi.mock('@/components/security/ProtectedAreaUnlocks',()=>({ProtectedAreaUnlocks:()=>null}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:()=>null}))
vi.mock('@/components/layout/Overlay',()=>({useOverlayManager:()=>{}}))
vi.mock('@/components/venice/VeniceModelSelect',()=>({categoryLabels:{image:'Images'}}))
vi.mock('@/components/Image',()=>({ImageInStorage:()=>null}))
vi.mock('@/i18n/fork',()=>({forkT:(value:string)=>value}))
import { LocalMediaBrowser } from './LocalMediaBrowser'
beforeEach(()=>{
 vi.clearAllMocks()
 Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}}))})
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
 vi.stubGlobal('IntersectionObserver',class{observe(){}unobserve(){}disconnect(){}})
 mocks.page.mockResolvedValue({items:Array.from({length:40},(_,i)=>({id:String(i),key:'asset-'+i,kind:'image',name:'Image '+i,mime:'image/png'})),next:null})
 mocks.file.mockImplementation(async()=>new File(['image'],'saved.png',{type:'image/png'}))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it.each([0,1])('inserts the selection using action %i above/below a long library without loading other images',async position=>{
 render(<MantineProvider><LocalMediaBrowser onChoose={mocks.choose}/></MantineProvider>)
 await screen.findByText('Image 39')
 const actions=screen.getAllByRole('button',{name:'Use selected content'})
 expect(actions).toHaveLength(2);expect(actions.every(button=>(button as HTMLButtonElement).disabled)).toBe(true)
 fireEvent.click(screen.getAllByRole('checkbox',{name:'Select'})[0])
 fireEvent.click(actions[position])
 await waitFor(()=>expect(mocks.choose).toHaveBeenCalledOnce())
 expect(mocks.file).toHaveBeenCalledOnce()
 expect(mocks.file.mock.calls[0][0].key).toBe('asset-0')
})
