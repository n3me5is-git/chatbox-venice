import { EventEmitter } from 'node:events'
import { expect,it,vi } from 'vitest'
import { defaultLocalMCPPermissions } from '../../shared/local-mcp'
const state=vi.hoisted(()=>({handlers:new Map<string,Function>(),backend:undefined as any,grant:{running:false} as any}))
vi.mock('electron',()=>({app:{on:vi.fn()},ipcMain:{handle:(name:string,handler:Function)=>state.handlers.set(name,handler)}}))
vi.mock('./server',()=>({LocalMCPServer:class{constructor(backend:any){state.backend=backend}state(){return state.grant}async stop(){state.grant={running:false}}async start(config:any){return state.grant={...config,running:true,url:'http://127.0.0.1:3000/mcp',token:'temporary-token',startedAt:1}}}}))
import { registerLocalMCPIPC } from './ipc'
function fixture(){
  const frame={url:'file:///app/index.html',routingId:1,processId:2},sender=Object.assign(new EventEmitter(),{mainFrame:frame,isDestroyed:()=>false,send:vi.fn()})
  registerLocalMCPIPC(()=>({webContents:sender}) as any)
  const event={sender,senderFrame:frame},invoke=(channel:string,...args:any[])=>state.handlers.get(channel)!(event,...args)
  return {sender,event,invoke,config:{sessionId:'chat',port:0,permissions:defaultLocalMCPPermissions}}
}
it('accepts control only from the trusted main frame, never embedded previews or another web contents',async()=>{
  const f=fixture()
  await expect(state.handlers.get('local-mcp:control')!({...f.event,senderFrame:{...f.event.senderFrame,routingId:3}},'start',f.config)).rejects.toThrow('main app')
  await expect(state.handlers.get('local-mcp:control')!({...f.event,sender:{}},'status')).rejects.toThrow('main app')
  f.event.senderFrame.url='https://evil.example';await expect(f.invoke('local-mcp:control','status')).rejects.toThrow('Untrusted')
  f.event.senderFrame.url='file:///app/index.html';expect(await f.invoke('local-mcp:control','start',f.config)).toMatchObject({running:true,sessionId:'chat'})
  await f.invoke('local-mcp:control','stop')
})
it('correlates app replies by an unpredictable request identity and forwards cancellation',async()=>{
  const f=fixture(),grant=await f.invoke('local-mcp:control','start',f.config),controller=new AbortController()
  const response=state.backend.listTools(grant,controller.signal)
  await vi.waitFor(()=>expect(f.sender.send).toHaveBeenCalled())
  const request=f.sender.send.mock.calls[0][1];expect(request.operation).toBe('list_tools');expect(request.id).toMatch(/^[a-f0-9-]{36}$/)
  await f.invoke('local-mcp:reply','unknown',{result:['not accepted']})
  await f.invoke('local-mcp:reply',request.id,{result:[{name:'scoped'}]});expect(await response).toEqual([{name:'scoped'}])
  const cancelled=state.backend.listTools(grant,controller.signal);controller.abort();await expect(cancelled).rejects.toThrow('cancelled')
  expect(f.sender.send).toHaveBeenCalledWith('local-mcp:request',expect.objectContaining({operation:'cancel'}));await f.invoke('local-mcp:control','stop')
})
