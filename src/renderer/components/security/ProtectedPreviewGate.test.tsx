// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {afterEach,expect,it,vi} from 'vitest'
import {ProtectedPreviewGate} from './ProtectedPreviewGate'
vi.mock('./ScopeUnlock',()=>({ScopeUnlock:({scope,onUnlocked}:{scope:string;onUnlocked:()=>void})=><button onClick={onUnlocked}>Unlock {scope}</button>}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({keys:{isUnlocked:()=>true}})}))
vi.mock('@/platform',()=>({default:{}}))
afterEach(cleanup)
it('requires fresh preview approval even if the key is already unlocked, and gates scope changes',()=>{const view=render(<ProtectedPreviewGate scope="app"><span>Private pixels</span></ProtectedPreviewGate>);expect(screen.queryByText('Private pixels')).toBeNull();fireEvent.click(screen.getByText('Unlock app'));expect(screen.getByText('Private pixels')).toBeTruthy();view.rerender(<ProtectedPreviewGate scope="project:two"><span>Private pixels</span></ProtectedPreviewGate>);expect(screen.queryByText('Private pixels')).toBeNull();fireEvent.click(screen.getByText('Unlock project:two'));expect(screen.getByText('Private pixels')).toBeTruthy();act(()=>window.dispatchEvent(new Event('chatbox:privacy-lock')));expect(screen.queryByText('Private pixels')).toBeNull()})
