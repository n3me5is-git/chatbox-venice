// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import type { LocalMCPStart,LocalMCPState } from '@shared/local-mcp'
import { LocalMCPSettings } from './LocalMCPSettings'
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('react-i18next',()=>({useTranslation:()=>({})}))
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
afterEach(cleanup)
it('never starts automatically and grants only the permissions selected by the human',async()=>{
  const invoke=vi.fn(async(command:string,input?:LocalMCPStart):Promise<LocalMCPState>=>command==='start'?{running:true,sessionId:input!.sessionId,permissions:input!.permissions,url:'http://127.0.0.1:3000/mcp',token:'ephemeral-local-token',startedAt:1}:{running:false})
  render(<MantineProvider><LocalMCPSettings sessionId="chat" invoke={invoke}/></MantineProvider>)
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('status'));expect(invoke).not.toHaveBeenCalledWith('start',expect.anything())
  expect((screen.getByRole('checkbox',{name:'Run isolated JavaScript and optional Python'}) as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox',{name:'Create, change and permanently delete session files'}))
  fireEvent.click(screen.getByRole('checkbox',{name:'Run isolated JavaScript and optional Python'}))
  fireEvent.click(screen.getByRole('button',{name:'Start sharing this chat'}))
  await screen.findByText('http://127.0.0.1:3000/mcp')
  expect(invoke).toHaveBeenCalledWith('start',{sessionId:'chat',port:0,permissions:{readFiles:true,writeFiles:true,execute:true,models:false,automaticModels:false,venice:false,search:false,forwardMCP:false}})
  fireEvent.click(screen.getByRole('button',{name:'Stop sharing'}));await screen.findByRole('button',{name:'Start sharing this chat'});expect(invoke).toHaveBeenCalledWith('stop')
})
it('requires model access before automatic paid calls can be selected',()=>{
  const invoke=vi.fn(async()=>({running:false as const}))
  render(<MantineProvider><LocalMCPSettings sessionId="chat" invoke={invoke}/></MantineProvider>)
  const automatic=screen.getByRole('checkbox',{name:'Automatically approve external model calls (may incur costs)'}) as HTMLInputElement
  expect(automatic.disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox',{name:'Call configured text models'}));expect(automatic.disabled).toBe(false)
  fireEvent.click(automatic);fireEvent.click(screen.getByRole('checkbox',{name:'Call configured text models'}));expect(automatic.checked).toBe(false);expect(automatic.disabled).toBe(true)
})
