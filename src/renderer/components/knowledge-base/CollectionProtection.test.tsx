// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('@/packages/knowledge-collections/service',()=>({knowledgeCollections:{}}))
import {CollectionProtection} from './CollectionProtection'
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done});return{promise,resolve}}
function service(protect:()=>Promise<void>){return{list:async()=>[{id:-1,scope:'public'}],protect,vault:{keys:{capabilities:async()=>({biometric:true}),status:async()=>({biometric:false}),isUnlocked:()=>true}}} as any}
it('retains caller busy state across panel unmount, rewrap completion and the subsequent reload',async()=>{
 const rewrap=deferred(),reload=deferred(),onBusyChange=vi.fn(),onChanged=vi.fn(()=>reload.promise),store=service(()=>rewrap.promise),view=render(<MantineProvider><CollectionProtection id={-1} service={store} onChanged={onChanged} onBusyChange={onBusyChange}/></MantineProvider>)
 fireEvent.click(screen.getByRole('button',{name:'Save protection'}));expect(onBusyChange.mock.calls).toEqual([[true]]);view.unmount();await act(async()=>rewrap.resolve());expect(onChanged).toHaveBeenCalledOnce();expect(onBusyChange.mock.calls).toEqual([[true]]);await act(async()=>reload.resolve());await waitFor(()=>expect(onBusyChange.mock.calls).toEqual([[true],[false]]))
})
it('releases caller busy state and reports a failed protection update',async()=>{
 const onBusyChange=vi.fn(),onChanged=vi.fn();render(<MantineProvider><CollectionProtection id={-1} service={service(async()=>{throw Error('Protection update failed')})} onChanged={onChanged} onBusyChange={onBusyChange}/></MantineProvider>);fireEvent.click(screen.getByRole('button',{name:'Save protection'}));expect((await screen.findByRole('alert')).textContent).toContain('Protection update failed');expect(onChanged).not.toHaveBeenCalled();expect(onBusyChange.mock.calls).toEqual([[true],[false]])
})
