// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({state:{root:'internal'} as any,status:vi.fn(),pick:vi.fn(),migrate:vi.fn(),notify:()=>{}}))
vi.mock('@/platform',()=>({default:{type:'mobile'}}))
vi.mock('@/packages/archive-storage/runtime',()=>({archiveRuntimeFor:()=>({engine:{state:async()=>f.state,ready:async()=>{},cleanup:async()=>{}},disk:{status:f.status,pick:f.pick},migrate:f.migrate,startup:async()=>{},subscribe:(fn:()=>void)=>{f.notify=fn;return()=>{}}})}))
vi.mock('./SettingsLayout',()=>({SettingsSection:({children,title}:any)=><section><h2>{title}</h2>{children}</section>}))
import {ArchiveStorage} from './ArchiveStorage'
beforeEach(()=>{vi.clearAllMocks();f.state={root:'internal'};f.status.mockResolvedValue({available:true,name:'Internal'});f.pick.mockResolvedValue({id:'sd',name:'SD'});f.migrate.mockRejectedValue(Error('Disk full'));Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const mount=()=>render(<MantineProvider><ArchiveStorage/></MantineProvider>)
it('offers a native SD selector, starts a chosen migration and shows failures without changing location',async()=>{mount();const select=await screen.findByRole('combobox',{name:'Save archive to'});fireEvent.change(select,{target:{value:'external'}});fireEvent.click(screen.getByRole('button',{name:'Migrate archive'}));await waitFor(()=>expect(f.migrate).toHaveBeenCalledWith('sd'));expect(await screen.findByText('Disk full')).toBeTruthy();expect(screen.getByText('Current location: Internal storage')).toBeTruthy()})
it('keeps missing SD selected, prevents empty internal replacement and offers reauthorization',async()=>{f.state={root:'card-id',enabled:true};f.status.mockResolvedValue({available:false,name:'SD'});mount();await screen.findByRole('alert');expect((screen.getByRole('button',{name:'Migrate archive'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Restore folder access'}));await waitFor(()=>expect(f.pick).toHaveBeenCalledWith('card-id'));expect(f.migrate).not.toHaveBeenCalled()})
