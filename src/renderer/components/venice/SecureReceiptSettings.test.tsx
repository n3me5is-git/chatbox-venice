// @vitest-environment jsdom
import {fireEvent,render,screen,cleanup} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {MantineProvider} from '@mantine/core'
import {SecureReceiptSettings} from './SecureReceiptSettings'
vi.mock('react-i18next',()=>({useTranslation:()=>({})}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:({opened,children}:any)=>opened?<div role="dialog">{children}</div>:null}))
afterEach(cleanup)
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
it('requires a separate warning confirmation and leaves cancel unchanged',()=>{
 const change=vi.fn();render(<MantineProvider><SecureReceiptSettings enabled={false} onChange={change}/></MantineProvider>)
 fireEvent.click(screen.getByRole('switch'));expect(change).not.toHaveBeenCalled();expect(screen.getByText(/substituted or replayed/)).toBeTruthy()
 fireEvent.click(screen.getByText('Cancel'));expect(change).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('switch'));fireEvent.click(screen.getByText('Enable compatible receipts'));expect(change).toHaveBeenCalledWith(true)
})
