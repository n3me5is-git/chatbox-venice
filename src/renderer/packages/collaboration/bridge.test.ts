import {it,expect,vi} from 'vitest'
it('blocks former guest tool turns and checks a revocation immediately',async()=>{
 vi.resetModules();const bridge=await import('./bridge')
 expect(()=>bridge.assertSharedTurn('chat','owner')).not.toThrow();expect(()=>bridge.assertSharedTurn('chat','alice')).toThrow('no longer authorized')
 let allowed=true
 bridge.installCollaborationBridge((_id,_actor,_input,local,_encode,_decode,signal)=>local(signal||new AbortController().signal),()=>true,undefined,(_id,actor)=>actor==='alice'&&allowed)
 expect(()=>bridge.assertSharedTurn('chat','alice')).not.toThrow();allowed=false;expect(()=>bridge.assertSharedTurn('chat','alice')).toThrow('no longer authorized')
})
it('does not convert a disconnected guest continuation into a local owner approval after restart',async()=>{
 vi.resetModules();const bridge=await import('./bridge'),local=vi.fn(async()=>true)
 const result=await bridge.routeSharedDecision('chat','alice',{kind:'confirm',title:'Paid request',detail:'$1'},local,value=>value,value=>value===true)
 expect(result).toBe(false);expect(local).not.toHaveBeenCalled()
})
