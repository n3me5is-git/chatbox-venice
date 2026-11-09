// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DedicatedAgentSchema, agentCallerDescription } from '@shared/multi-agent'
import { AgentCallingDetails } from './AgentCallingDetails'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('edits multiline description and details, persists sharing and can turn it off again',()=>{
 let saved:any
 const initial=DedicatedAgentSchema.parse({id:'writer',name:'writer',title:'Writer',prompt:'Worker instructions',model:{provider:'venice',modelId:'text'}})
 function Harness(){const [value,setValue]=useState(initial);return <AgentCallingDetails value={value} onChange={change=>{saved=DedicatedAgentSchema.parse({...value,...change});setValue(saved)}}/>}
 const view=render(<MantineProvider><Harness/></MantineProvider>)
 expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA')
 fireEvent.change(screen.getByLabelText('Description'),{target:{value:'First line\nSecond line'}})
 fireEvent.change(screen.getByLabelText('Additional details for callers'),{target:{value:'Input: Markdown\nOutput: report'}})
 const toggle=screen.getByRole('switch',{name:'Share worker instructions with callers'})
 expect((toggle as HTMLInputElement).checked).toBe(false);fireEvent.click(toggle)
 const restored=DedicatedAgentSchema.parse(JSON.parse(JSON.stringify(saved)))
 expect(agentCallerDescription(restored)).toContain('First line\nSecond line');expect(agentCallerDescription(restored)).toContain('Input: Markdown\nOutput: report');expect(restored.sharePromptWithCaller).toBe(true)
 view.unmount();render(<MantineProvider><AgentCallingDetails value={restored} onChange={change=>saved={...restored,...change}}/></MantineProvider>)
 expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toContain('\n')
 fireEvent.click(screen.getByRole('switch',{name:'Share worker instructions with callers'}));expect(agentCallerDescription(saved)).not.toContain('Worker instructions (shared')
})
