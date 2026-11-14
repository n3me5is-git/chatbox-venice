// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const list=vi.hoisted(()=>vi.fn(async()=>[{id:-1,name:'Encrypted manuals'},{id:-2,name:'Protected collection'},{id:10,name:'Legacy desktop'}]))
const keys=vi.hoisted(()=>({revision:0,notify:()=>{}}))
vi.mock('@/packages/vault/runtime',()=>({installedVaultFor:()=>({keys:{snapshot:()=>keys.revision,subscribe:(fn:()=>void)=>{keys.notify=fn;return()=>{}}}})}))
beforeEach(()=>{keys.revision=0;list.mockClear()})
vi.mock('@/platform',()=>({default:{getKnowledgeBaseController:()=>({list})}}))
import {ChatKnowledgeCollections} from './ChatKnowledgeCollections'
afterEach(cleanup)
it('lists portable collections only on demand, and saves attachment selection without reading protected contents',async()=>{
 Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});const change=vi.fn();render(<MantineProvider><ChatKnowledgeCollections value={undefined} onChange={change}/></MantineProvider>);expect(list).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Choose collections'}));fireEvent.click(await screen.findByRole('checkbox',{name:'Protected collection'}));expect(change).toHaveBeenCalledWith([-2]);expect(screen.queryByText('Legacy desktop')).toBeNull()
})

it('removes decrypted collection names from a loaded picker when vault keys change',async()=>{
 render(<MantineProvider><ChatKnowledgeCollections value={[-1]} onChange={()=>{}}/></MantineProvider>);fireEvent.click(screen.getByRole('button',{name:'Choose collections'}));await screen.findByRole('checkbox',{name:'Encrypted manuals'});await act(async()=>{keys.revision++;keys.notify()});expect(screen.queryByRole('checkbox',{name:'Encrypted manuals'})).toBeNull()
})
