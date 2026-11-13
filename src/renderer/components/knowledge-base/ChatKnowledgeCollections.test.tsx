// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
const list=vi.hoisted(()=>vi.fn(async()=>[{id:-1,name:'Encrypted manuals'},{id:-2,name:'Protected collection'},{id:10,name:'Legacy desktop'}]))
vi.mock('@/platform',()=>({default:{getKnowledgeBaseController:()=>({list})}}))
import {ChatKnowledgeCollections} from './ChatKnowledgeCollections'
afterEach(cleanup)
it('lists portable collections only on demand, and saves attachment selection without reading protected contents',async()=>{
 Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});const change=vi.fn();render(<MantineProvider><ChatKnowledgeCollections value={undefined} onChange={change}/></MantineProvider>);expect(list).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Choose collections'}));fireEvent.click(await screen.findByRole('checkbox',{name:'Protected collection'}));expect(change).toHaveBeenCalledWith([-2]);expect(screen.queryByText('Legacy desktop')).toBeNull()
})
