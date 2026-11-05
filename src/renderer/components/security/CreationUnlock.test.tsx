// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import type { VaultKeys } from '@/packages/vault/keys'
import { CreationUnlock } from './CreationUnlock'
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
afterEach(cleanup)
it('unlocks the creation’s project key and clears an entered PIN when switching protected areas',async()=>{
 const unlock=vi.fn(async()=>{}),keys={subscribe:()=>()=>{},snapshot:()=>0,status:async()=>({configured:true,pin:true,biometric:false,unlocked:false,retryAt:0}),unlock} as unknown as VaultKeys
 const view=render(<MantineProvider><CreationUnlock keys={keys} protection="project:first"/></MantineProvider>)
 const first=await screen.findByLabelText('PIN or passphrase');fireEvent.change(first,{target:{value:'123456'}})
 view.rerender(<MantineProvider><CreationUnlock keys={keys} protection="project:second"/></MantineProvider>)
 const second=await screen.findByLabelText('PIN or passphrase');expect((second as HTMLInputElement).value).toBe('');fireEvent.change(second,{target:{value:'654321'}});fireEvent.click(screen.getByRole('button',{name:'Unlock'}));await waitFor(()=>expect(unlock).toHaveBeenCalledWith('project:second','pin','654321'))
})
