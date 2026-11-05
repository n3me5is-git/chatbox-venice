// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { ScopeUnlock } from './ScopeUnlock'
import type { VaultKeys } from '@/packages/vault/keys'
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
afterEach(cleanup)
it('waits for an explicit unlock action, clears a rejected PIN and offers device unlock separately',async()=>{
 const unlock=vi.fn().mockRejectedValueOnce(new Error('Incorrect PIN')).mockResolvedValue(undefined),done=vi.fn();const keys={subscribe:()=>()=>{},snapshot:()=>0,status:async()=>({configured:true,pin:true,biometric:true,unlocked:false,retryAt:0}),unlock} as unknown as VaultKeys
 render(<MantineProvider><ScopeUnlock keys={keys} onUnlocked={done}/></MantineProvider>);const pin=await screen.findByLabelText('PIN or passphrase');expect(unlock).not.toHaveBeenCalled();fireEvent.change(pin,{target:{value:'123456'}});fireEvent.click(screen.getByRole('button',{name:'Unlock'}));expect(await screen.findByText('Incorrect PIN')).toBeTruthy();expect((pin as HTMLInputElement).value).toBe('');expect(done).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Use device unlock'}));await waitFor(()=>expect(done).toHaveBeenCalledOnce());expect(unlock).toHaveBeenLastCalledWith('app','biometric','')
})
