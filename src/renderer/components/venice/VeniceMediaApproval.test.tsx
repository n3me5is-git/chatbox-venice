// @vitest-environment jsdom
import NiceModal from '@ebay/nice-modal-react'
import {MantineProvider} from '@mantine/core'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {sessionApprovals} from '@/packages/venice/session-approvals'
vi.mock('@/hooks/useScreenChange',()=>({useIsSmallScreen:()=>false}))
import {VeniceMediaApproval} from './VeniceMediaApproval'
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}});Element.prototype.scrollIntoView=vi.fn()})
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionApprovals.clear('first');sessionApprovals.clear('second')})
it('keeps mode changes as a draft until approval and resets the dialog for the next chat',async()=>{
 render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let pending:Promise<unknown>
 act(()=>{pending=NiceModal.show(VeniceMediaApproval,{sessionId:'first',message:'same',generation:true})})
 fireEvent.click(await screen.findByLabelText('Generation approval for this chat',{selector:'input'}));fireEvent.click(screen.getByRole('option',{name:'Automatically approve generations'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
 expect(await pending!).toMatchObject({approved:false,mode:'automatic'});expect(sessionApprovals.mode('first')).toBe('ask')
 act(()=>{pending=NiceModal.show(VeniceMediaApproval,{sessionId:'second',message:'same',generation:true})})
 expect((await screen.findByLabelText('Generation approval for this chat',{selector:'input'}) as HTMLInputElement).value).toBe('Ask every time')
 fireEvent.click(screen.getByRole('button',{name:'Approve'}));expect(await pending!).toMatchObject({approved:true,mode:'ask'})
})
it('cancels on abort and never grants permissions from a cancelled dialog',async()=>{
 const abort=new AbortController();render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let pending:Promise<unknown>
 act(()=>{pending=NiceModal.show(VeniceMediaApproval,{sessionId:'first',message:'test',generation:true,request:{action:'generate',kind:'speech',model:'tts',prompt:'hello',signal:abort.signal}})})
 await screen.findByText('hello');act(()=>abort.abort());expect(await pending!).toMatchObject({approved:false});expect(sessionApprovals.mode('first')).toBe('ask')
})
