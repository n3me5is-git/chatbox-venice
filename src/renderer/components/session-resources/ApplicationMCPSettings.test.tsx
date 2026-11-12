// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {LocalMCPStartSchema} from '@shared/local-mcp'
const state=vi.hoisted(()=>({grants:[] as any[],invoke:vi.fn(),cleanup:vi.fn(async()=>({pending:0}))}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('react-i18next',()=>({useTranslation:()=>({})}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>({providers:{venice:{apiKey:'SENTINEL_KEY'}}})})}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({available:async()=>true,db:{getSetting:async()=>[],setSetting:async()=>{}},projects:{assertApp:async()=>{}}})}))
vi.mock('@/packages/local-mcp/application',()=>({cleanupInactiveMCPContexts:()=>state.cleanup(),revokeApplicationMCP:vi.fn(async()=>({pending:0}))}))
import {ApplicationMCPSettings} from './ApplicationMCPSettings'
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
beforeEach(()=>{vi.clearAllMocks();state.grants=[];state.invoke.mockImplementation(async(_channel,command,input)=>{if(command==='list')return state.grants;if(command==='start'){const parsed=LocalMCPStartSchema.parse(input),grant={...parsed,running:true,url:'http://127.0.0.1:'+String(3000+state.grants.length)+'/mcp',token:'token-'+state.grants.length,startedAt:1};state.grants.push(grant);return grant}if(command==='stop-endpoint')state.grants=state.grants.filter(item=>item.endpointId!==input);return {running:false}});Object.assign(window,{electronAPI:{invoke:state.invoke}})})
afterEach(cleanup)
it('starts only on demand, offers three profiles and adds endpoints without replacing the first',async()=>{
  render(<MantineProvider><ApplicationMCPSettings/></MantineProvider>)
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('local-mcp:control','list',undefined))
  expect(state.invoke.mock.calls.some(call=>call[1]==='start')).toBe(false)
  expect(screen.getByRole('combobox',{name:'Access profile'})).toHaveProperty('value','router')
  fireEvent.click(screen.getByRole('button',{name:'Start new endpoint'}));await screen.findByText('http://127.0.0.1:3000/mcp')
  expect(state.grants[0].application.mode).toBe('router');expect(state.grants[0].permissions).toMatchObject({models:true,execute:false,forwardMCP:false,multiAgent:false})
  fireEvent.change(screen.getByRole('textbox',{name:'Endpoint name'}),{target:{value:'Second'}})
  fireEvent.change(screen.getByRole('combobox',{name:'Access profile'}),{target:{value:'shadow'}})
  fireEvent.click(screen.getByRole('button',{name:'Start new endpoint'}));await screen.findByText('http://127.0.0.1:3001/mcp')
  expect(state.grants).toHaveLength(2);expect(state.grants[1].endpointId).not.toBe(state.grants[0].endpointId)
  expect(JSON.stringify(state.invoke.mock.calls)).not.toContain('SENTINEL_KEY')
})
it('requires explicit payment grants and can require E2EE without silently authorizing Studio',async()=>{
  render(<MantineProvider><ApplicationMCPSettings/></MantineProvider>)
  fireEvent.change(screen.getByRole('combobox',{name:'Text transport privacy'}),{target:{value:'e2ee'}})
  fireEvent.click(screen.getByRole('button',{name:'Start new endpoint'}));await screen.findByText('http://127.0.0.1:3000/mcp')
  expect(state.grants[0]).toMatchObject({application:{privacy:'e2ee',providers:['venice'],automaticStudio:false,externalTools:false},permissions:{automaticModels:false,venice:false}})
})
