// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
const state=vi.hoisted(()=>({provider:{apiKey:'synthetic',venice:{}} as any,header:{id:'chat',settings:{}} as any,draft:undefined as boolean|undefined,update:vi.fn(),setDraft:vi.fn()}))
vi.mock('@/stores/settingsStore',()=>({useSettingsStore:(select:any)=>select({providers:{venice:state.provider}})}))
vi.mock('@/stores/uiStore',()=>({useUIStore:(select:any)=>select({newSessionState:{veniceToolsEnabled:state.draft},setNewSessionState:state.setDraft})}))
vi.mock('@/hooks/useSessionPresentation',()=>({useSessionPresentation:()=>({header:state.header})}))
vi.mock('@/app/renderer-application',()=>({rendererApplication:{sessions:{updateSessionHeader:(...args:any[])=>state.update(...args)}}}))
import { SessionVeniceTools } from './SessionVeniceTools'
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
beforeEach(()=>{vi.clearAllMocks();state.provider={apiKey:'synthetic',venice:{}};state.header={id:'chat',settings:{provider:'other'}};state.draft=undefined;state.update.mockImplementation(async(_id:string,change:any)=>{state.header=change(state.header)});state.setDraft.mockImplementation((change:any)=>{state.draft=change({}).veniceToolsEnabled})})
afterEach(cleanup)
const mount=(providerId='other',sessionId='chat')=>render(<MantineProvider><SessionVeniceTools providerId={providerId} sessionId={sessionId}/></MantineProvider>)
it('starts off for other providers, persists explicit chat opt-in and hides the row when restricted',async()=>{
  const view=mount();const toggle=screen.getByRole('switch',{name:'Venice tools for this chat'}) as HTMLInputElement;expect(toggle.checked).toBe(false);fireEvent.click(toggle);await waitFor(()=>expect(state.header.settings.veniceToolsEnabled).toBe(true))
  state.provider.venice.chatToolsVeniceOnly=true;view.rerender(<MantineProvider><SessionVeniceTools providerId="other" sessionId="chat"/></MantineProvider>);expect(screen.queryByRole('switch')).toBeNull()
})
it('retains the Venice default and carries new-chat opt-in in its draft',async()=>{
  const view=mount('venice');expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);view.unmount();mount('other','new');fireEvent.click(screen.getByRole('switch'));await waitFor(()=>expect(state.draft).toBe(true));expect(state.update).not.toHaveBeenCalled()
})
