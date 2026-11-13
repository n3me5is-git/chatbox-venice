// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({save:vi.fn()}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({setSettings:state.save})},useSettingsStore:(select:any)=>select({defaultVirtualRerankModel:{provider:'old',model:'old-ranker'}})}))
vi.mock('@/components/ModelSelectorV2',()=>({ModelSelectorV2:({children,onSelect,modelFilter}:any)=><div>{children}<button onClick={()=>{expect(modelFilter({type:'embedding'})).toBe(false);expect(modelFilter({type:'chat'})).toBe(true);onSelect('private','small')}}>Choose text model</button></div>}))
import {KnowledgeModelDefaults} from './KnowledgeModelDefaults'
afterEach(cleanup)
it('saves a global text model without enabling any collection or making provider calls',()=>{
 render(<MantineProvider><KnowledgeModelDefaults/></MantineProvider>);fireEvent.click(screen.getByRole('button',{name:'Choose text model'}));expect(state.save).toHaveBeenCalledWith({defaultVirtualRerankModel:{provider:'private',model:'small'}})
 fireEvent.click(screen.getByRole('button',{name:'Clear'}));expect(state.save).toHaveBeenCalledWith({defaultVirtualRerankModel:undefined})
})
