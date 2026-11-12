// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {sessionApprovals} from '@/packages/venice/session-approvals'
import {VeniceSessionApprovals} from './VeniceSessionApprovals'
afterEach(()=>{cleanup();sessionApprovals.clear('ui-chat');sessionApprovals.clear('other')})
it('changes only this chat and resets immediately from the visible controls',()=>{
 render(<MantineProvider><VeniceSessionApprovals sessionId="ui-chat"/></MantineProvider>)
 fireEvent.click(screen.getByRole('radio',{name:'Automatically approve generations'}))
 expect(sessionApprovals.mode('ui-chat')).toBe('automatic');expect(sessionApprovals.mode('other')).toBe('ask')
 fireEvent.click(screen.getByRole('button',{name:'Reset approvals for this chat'}));expect(sessionApprovals.mode('ui-chat')).toBe('ask')
})

Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
vi.stubGlobal('ResizeObserver',class {observe(){} unobserve(){} disconnect(){}})
Element.prototype.scrollIntoView=vi.fn()

it('accepts a touch on the full approval row while a scroll gesture does not select it',()=>{
 render(<MantineProvider><VeniceSessionApprovals sessionId="ui-chat"/></MantineProvider>)
 const radio=screen.getByRole('radio',{name:'Remember similar generations after approval'}),row=radio.closest('[data-approval-mode]')!
 const pointer=(type:string,x:number)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,pointerType:'touch',clientX:x,clientY:10});fireEvent(row,event)}
 pointer('pointerdown',10);pointer('pointerup',40);expect(sessionApprovals.mode('ui-chat')).toBe('ask')
 pointer('pointerdown',10);pointer('pointerup',10);expect(sessionApprovals.mode('ui-chat')).toBe('similar')
 fireEvent.click(screen.getByRole('radio',{name:'Automatically approve generations'}).closest('[data-approval-mode]')!);expect(sessionApprovals.mode('ui-chat')).toBe('automatic')
})
