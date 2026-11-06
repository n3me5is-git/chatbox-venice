// @vitest-environment jsdom
import NiceModal,{useModal} from '@ebay/nice-modal-react'
import {Button,MantineProvider,TextInput} from '@mantine/core'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {useState} from 'react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {AdaptiveModal} from './AdaptiveModal'
import {ProjectProtectionMode} from '@/components/security/ProjectProtectionMode'
import {closeTopSurface} from '@/packages/overlay-back'
vi.mock('@/hooks/useScreenChange',()=>({useIsSmallScreen:()=>true}))
Object.defineProperty(window,'matchMedia',{writable:true,value:()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()})})
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
Element.prototype.scrollIntoView=vi.fn()
const ProjectModal=NiceModal.create(()=>{const modal=useModal();const [name,setName]=useState(''),[mode,setMode]=useState('none');return <AdaptiveModal opened={modal.visible} onClose={()=>modal.hide()} title="Project" onExitTransitionEnd={modal.remove}><TextInput label="Project name" value={name} onChange={event=>setName(event.currentTarget.value)}/><ProjectProtectionMode value={mode} onChange={setMode}/><Button onClick={()=>modal.hide()}>Save project</Button></AdaptiveModal>})
afterEach(()=>{cleanup()})
const show=()=>{render(<MantineProvider><NiceModal.Provider/></MantineProvider>);act(()=>{void NiceModal.show(ProjectModal)})}
describe('mobile panels with production project controls',()=>{
 it('selects and retains project protection inside the modal focus scope',()=>{show();fireEvent.click(screen.getByLabelText('Project protection'));fireEvent.click(screen.getByRole('option',{name:'Use a dedicated project PIN'}));expect((screen.getByLabelText('Project protection')as HTMLInputElement).value).toBe('Use a dedicated project PIN')})
 it('releases the previous form after closing and reopening',async()=>{show();fireEvent.change(screen.getByLabelText('Project name'),{target:{value:'Draft'}});fireEvent.click(screen.getByText('Save project'));await waitFor(()=>expect(screen.queryByLabelText('Project name')).toBeNull());act(()=>{void NiceModal.show(ProjectModal)});expect((await screen.findByLabelText('Project name')as HTMLInputElement).value).toBe('')})
 it('uses native back to close the open panel without navigating',async()=>{show();act(()=>{expect(closeTopSurface()).toBe(true)});await waitFor(()=>expect(screen.queryByLabelText('Project name')).toBeNull());expect(closeTopSurface()).toBe(false)})
})
