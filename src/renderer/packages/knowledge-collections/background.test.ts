// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({enabled:true,start:vi.fn(),stop:vi.fn(),lock:vi.fn()}))
vi.mock('@capacitor/core',()=>({registerPlugin:()=>({start:state.start,stop:state.stop})}))
vi.mock('@/platform',()=>({default:{type:'mobile'}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({db:{getSetting:async()=>state.enabled}})}))
vi.mock('@/components/security/AppGate',()=>({lockApplication:state.lock}))
import {indexingMayPreventLock,indexingBackgroundStatus,syncIndexingBackground} from './background'
beforeEach(async()=>{state.enabled=true;state.start.mockResolvedValue({active:true});state.stop.mockResolvedValue(undefined);await syncIndexingBackground(0);vi.clearAllMocks()})
afterEach(()=>vi.restoreAllMocks())
it('defers automatic locking only while the requested foreground service is active',async()=>{await syncIndexingBackground(1);expect(await indexingMayPreventLock()).toBe(true);expect(state.start).toHaveBeenCalledOnce();await syncIndexingBackground(2);expect(state.start).toHaveBeenCalledOnce();await syncIndexingBackground(0);expect(state.stop).toHaveBeenCalledOnce();expect(await indexingMayPreventLock()).toBe(false)})
it('retains automatic protection when notifications or service start are denied',async()=>{state.start.mockRejectedValue(Error('Permission denied'));await syncIndexingBackground(1);expect(await indexingMayPreventLock()).toBe(false);expect(indexingBackgroundStatus().error).toContain('Keep the app open');state.enabled=false;await syncIndexingBackground(1);expect(await indexingMayPreventLock()).toBe(false)})
it('relocks after Android terminates an active background service',async()=>{await syncIndexingBackground(1);vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');window.dispatchEvent(new Event('chatbox:indexing-background-ended'));await vi.waitFor(()=>expect(state.lock).toHaveBeenCalledOnce());expect(await indexingMayPreventLock()).toBe(false)})
