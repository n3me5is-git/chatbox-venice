// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('@/stores/settingsStore',()=>({useSettingsStore:(select:any)=>select({defaultKnowledgeVerifierModel:{provider:'private',model:'reviewer'}})}))
vi.mock('@/components/ModelSelectorV2',()=>({ModelSelectorV2:({children}:any)=><div>{children}</div>}))
import {ChatKnowledgeReview} from './ChatKnowledgeReview'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('requires explicit provider consent before enabling the saved global verifier, and disables independently',()=>{
 const change=vi.fn(),view=render(<MantineProvider><ChatKnowledgeReview value={undefined} onChange={change}/></MantineProvider>);fireEvent.click(screen.getByRole('switch',{name:'Check answers against sources'}));expect(change).not.toHaveBeenCalled();expect((screen.getByRole('button',{name:'Enable source review'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox',{name:'I allow this verifier to process the answer and source excerpts'}));fireEvent.click(screen.getByRole('button',{name:'Enable source review'}));expect(change).toHaveBeenCalledWith({enabled:true,consented:true,model:{provider:'private',model:'reviewer'},correctConflicts:true});view.rerender(<MantineProvider><ChatKnowledgeReview value={change.mock.calls[0][0]} onChange={change}/></MantineProvider>);fireEvent.click(screen.getByRole('switch',{name:'Check answers against sources'}));expect(change.mock.calls.at(-1)![0].enabled).toBe(false)
})
