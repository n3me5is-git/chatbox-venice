// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { DedicatedAgentSchema } from '@shared/multi-agent'
vi.mock('@/hooks/useProviders',()=>({useProviders:()=>({providers:[]})}))
vi.mock('@/components/InputBox/ReasoningControlButton',()=>({default:()=>null}))
vi.mock('@/components/venice/VeniceSessionPrivacySettings',()=>({VeniceSessionPrivacySettings:()=>null}))
import { AgentParameters } from './AgentParameters'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});Element.prototype.scrollIntoView=vi.fn()})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('saves an agent context override and dropdown selection, then returns to inherited global budget',()=>{
  const save=vi.fn()
  function Harness(){const [value,setValue]=useState<Record<string,unknown>>({});return <AgentParameters model={{provider:'openai-sub-unofficial',modelId:'custom'}} value={value} onChange={next=>{save(next);setValue(next)}}/>}
  render(<MantineProvider><Harness/></MantineProvider>)
  fireEvent.change(screen.getByLabelText('Agent context budget (tokens)'),{target:{value:'180000'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}))
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({contextTokenLimit:180000}))
  fireEvent.click(screen.getByLabelText('Auto Compaction',{selector:'input'}));fireEvent.click(screen.getByRole('option',{name:'Off'}))
  const agent=DedicatedAgentSchema.parse({id:'a',name:'worker',title:'Worker',prompt:'Work',model:{provider:'openai-sub-unofficial',modelId:'custom'},parameters:save.mock.calls.at(-1)![0]})
  expect(agent.parameters).toMatchObject({contextTokenLimit:180000,autoCompaction:false})
  fireEvent.click(screen.getByRole('button',{name:'Use default'}));expect(save.mock.calls.at(-1)![0]).toMatchObject({contextTokenLimit:undefined,autoCompaction:false})
})
