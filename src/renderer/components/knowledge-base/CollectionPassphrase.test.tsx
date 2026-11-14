// @vitest-environment jsdom
import NiceModal from '@ebay/nice-modal-react'
import {MantineProvider} from '@mantine/core'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('@/components/security/usePrivacyDismiss',()=>({usePrivacyDismiss:()=>{}}))
vi.mock('@/components/common/AdaptiveModal',()=>({AdaptiveModal:({opened,onClose,children,title}:any)=>opened?<div role="dialog" aria-label={title}>{children}<button onClick={onClose}>Cancel</button></div>:null}))
import {requestCollectionPassphrase} from './CollectionPassphrase'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('requires a matching portable passphrase and clears the input after returning it',async()=>{render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let result!:Promise<string|null>;act(()=>{result=requestCollectionPassphrase(true)});const create=await screen.findByRole('button',{name:'Create encrypted database'});expect((create as HTMLButtonElement).disabled).toBe(true);fireEvent.change(screen.getByLabelText('Collection passphrase'),{target:{value:'portable collection passphrase'}});fireEvent.change(screen.getByLabelText('Repeat passphrase'),{target:{value:'different'}});expect((create as HTMLButtonElement).disabled).toBe(true);fireEvent.change(screen.getByLabelText('Repeat passphrase'),{target:{value:'portable collection passphrase'}});fireEvent.click(create);expect(await result).toBe('portable collection passphrase');expect(screen.queryByDisplayValue('portable collection passphrase')).toBeNull()})
it('returns cancellation without manufacturing a passphrase or approving writes',async()=>{render(<MantineProvider><NiceModal.Provider/></MantineProvider>);let result!:Promise<string|null>;act(()=>{result=requestCollectionPassphrase()});fireEvent.click(await screen.findByRole('button',{name:'Cancel'}));expect(await result).toBeNull()})
