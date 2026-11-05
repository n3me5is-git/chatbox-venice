// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {sessionApprovals} from '@/packages/venice/session-approvals'
import {VeniceSessionApprovals} from './VeniceSessionApprovals'
afterEach(()=>{cleanup();sessionApprovals.clear('ui-chat');sessionApprovals.clear('other')})
it('changes only this chat and resets immediately from the visible controls',()=>{
 render(<MantineProvider><VeniceSessionApprovals sessionId="ui-chat"/></MantineProvider>)
 fireEvent.click(screen.getByLabelText('Generation approval for this chat',{selector:'input'}));fireEvent.click(screen.getByRole('option',{name:'Automatically approve generations'}))
 expect(sessionApprovals.mode('ui-chat')).toBe('automatic');expect(sessionApprovals.mode('other')).toBe('ask')
 fireEvent.click(screen.getByRole('button',{name:'Reset approvals for this chat'}));expect(sessionApprovals.mode('ui-chat')).toBe('ask')
})

Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}})
Element.prototype.scrollIntoView=vi.fn()
