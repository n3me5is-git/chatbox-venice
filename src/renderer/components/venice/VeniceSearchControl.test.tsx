// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { VeniceSearchControl } from './VeniceSearchControl'
import { E2EEToolSettings } from './E2EEToolSettings'
Object.defineProperty(window,'matchMedia',{writable:true,value:()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()})})
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});Element.prototype.scrollIntoView=vi.fn()})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Venice search pause and encrypted tool consent',()=>{
 it('pauses and resumes without replacing the configured search mode or engine',()=>{
  const changes=vi.fn();function Control(){const[enabled,setEnabled]=useState(true);return <VeniceSearchControl settings={{webSearch:'auto',searchProvider:'brave',webSearchEnabled:enabled}} onEnabledChange={value=>{setEnabled(value);changes(value)}} onOpen={()=>{}}/>}
  render(<MantineProvider><Control/></MantineProvider>);const input=screen.getByLabelText('Enable Venice search for this chat') as HTMLInputElement
  expect(input.checked).toBe(true);fireEvent.click(input);expect(input.checked).toBe(false);expect(screen.getByText('Paused for this chat')).toBeTruthy()
  fireEvent.click(input);expect(input.checked).toBe(true);expect(changes.mock.calls).toEqual([[false],[true]])
 })
 it('greys the pause switch when the profile says not to search',()=>{
  render(<MantineProvider><VeniceSearchControl settings={{webSearch:'off',webSearchEnabled:true}} onEnabledChange={vi.fn()} onOpen={()=>{}}/></MantineProvider>)
  const input=screen.getByLabelText('Enable Venice search for this chat') as HTMLInputElement
  expect(input.disabled).toBe(true);expect(input.checked).toBe(false)
 })
 it('requires consent and preserves the encrypted text transport choice',async()=>{
  const change=vi.fn();render(<MantineProvider><E2EEToolSettings enabled={false} onChange={change}/></MantineProvider>)
  fireEvent.click(screen.getByLabelText('Tools in encrypted chat'));expect(change).not.toHaveBeenCalled()
  expect(await screen.findByText(/Search services and MCP servers receive/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Enable tools'}));expect(change).toHaveBeenCalledWith(true,'encrypted-text')
 })
 it('does not grant tool access when the privacy dialog is canceled',async()=>{
  const change=vi.fn();render(<MantineProvider><E2EEToolSettings enabled={false} onChange={change}/></MantineProvider>)
  fireEvent.click(screen.getByLabelText('Tools in encrypted chat'));await screen.findByRole('button',{name:'Cancel'});fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Enable tools'})).toBeNull());expect(change).not.toHaveBeenCalled()
 })
 it('explains that native tool arguments remain visible while text results are encrypted',async()=>{
  const change=vi.fn();render(<MantineProvider><E2EEToolSettings enabled={false} mode="native" onChange={change}/></MantineProvider>)
  fireEvent.click(screen.getByLabelText('Tools in encrypted chat'))
  expect(await screen.findByText(/Tool definitions, names, call IDs and arguments are visible to Venice/)).toBeTruthy()
  expect(screen.getByText(/Non-empty text results are encrypted before returning to the model/)).toBeTruthy()
  expect(change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Enable tools'}));expect(change).toHaveBeenCalledWith(true,'native')
 })
})
