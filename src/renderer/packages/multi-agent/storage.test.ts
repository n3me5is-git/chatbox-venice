import {expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({header:null as any,finish:null as null|(()=>void),put:vi.fn(),remove:vi.fn()}))
vi.mock('@/platform',()=>({default:{type:'desktop'}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({available:async()=>true,projects:{assertSession:async()=>{},sessionScope:async()=>null},assets:{header:async()=>state.header,put:state.put,remove:state.remove}})}))
import {updateAgentData,removeAgentData} from './storage'
it('deletes encrypted agent metadata after an already accepted write, without letting the write recreate it',async()=>{
 state.header=null;state.put.mockImplementation(async()=>{await new Promise<void>(resolve=>state.finish=resolve);state.header={id:'new-encrypted-record'};return 'saved'})
 state.remove.mockImplementation(async()=>{state.header=null})
 const writing=updateAgentData('temporary-runs',[],()=>['task'],'temporary-session')
 await vi.waitFor(()=>expect(state.finish).not.toBeNull())
 const removing=removeAgentData('temporary-runs');expect(state.remove).not.toHaveBeenCalled()
 state.finish!();await writing;await removing
 expect(state.remove).toHaveBeenCalledWith('temporary-runs');expect(state.header).toBeNull()
})
