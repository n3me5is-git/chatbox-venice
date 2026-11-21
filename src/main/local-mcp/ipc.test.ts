import { EventEmitter } from 'node:events'
import { expect,it,vi } from 'vitest'
import { defaultLocalMCPPermissions,LocalMCPApplicationSchema } from '../../shared/local-mcp'
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
  expect(f.sender.send).toHaveBeenCalledWith('local-mcp:request',expect.objectContaining({operation:'revoke',grant:expect.objectContaining({token:'temporary-token'})}))
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
it('enforces restricted lock admission before renderer dispatch and resumes the kept endpoint', async () => {
  const f=fixture()
  const config={...f.config,sessionId:'application',endpointId:crypto.randomUUID(),keepWhileLocked:true,permissions:{...defaultLocalMCPPermissions,models:true,automaticModels:true,venice:true},application:LocalMCPApplicationSchema.parse({mode:'router',name:'Router'})}
  const grant=await f.invoke('local-mcp:control','start',config)
  await f.invoke('local-mcp:control','suspend',true)
  const signal=new AbortController().signal
  await expect(state.backend.readResource(grant,'chatbox-session://private/file',signal)).rejects.toThrow('Unlock Chatbox')
  for (const action of ['generate', 'status', 'quote', 'wait', 'voices', 'cleanup_remote']) {
    await expect(state.backend.callTool(grant,'venice_studio',{action},'id',signal)).rejects.toThrow('Unlock Chatbox')
  }
  for (const [name, action] of [['venice_studio', 'catalog'], ['venice_image', 'models'], ['venice_media', 'catalog']]) {
    const response = state.backend.callTool(grant,name,{action},'id',signal)
    const request = f.sender.send.mock.calls.at(-1)![1]
    expect(request).toMatchObject({operation:'call_tool',name,arguments:{action},locked:true})
    await f.invoke('local-mcp:reply',request.id,{result:['catalog']})
    expect(await response).toEqual(['catalog'])
  }
  await expect(f.invoke('local-mcp:control','start',f.config)).rejects.toThrow('Unlock Chatbox')
  const allowed=state.backend.callTool(grant,'app_model',{},'id',signal)
  const request=f.sender.send.mock.calls.at(-1)![1]
  expect(request).toMatchObject({operation:'call_tool',name:'app_model',locked:true})
  await f.invoke('local-mcp:reply',request.id,{result:'approved text'})
  expect(await allowed).toBe('approved text')
  await f.invoke('local-mcp:control','resume')
  expect(await f.invoke('local-mcp:control','status',grant.endpointId)).toMatchObject({running:true,token:grant.token})
  await f.invoke('local-mcp:control','stop-all')
})
it('admits granted advanced calls only for opt-in endpoints and closes storage admission on revocation', async () => {
  const f = fixture()
  const config = { ...f.config, sessionId: 'application', endpointId: crypto.randomUUID(), keepWhileLocked: true,
    allowOperationsWhileLocked: true, permissions: { ...defaultLocalMCPPermissions, venice: true },
    application: LocalMCPApplicationSchema.parse({ mode: 'router', name: 'Background Studio', automaticStudio: true }) }
  const grant = await f.invoke('local-mcp:control', 'start', config)
  expect(await f.invoke('local-mcp:control', 'background-access')).toBe(false)
  await f.invoke('local-mcp:control', 'suspend', true)
  expect(await f.invoke('local-mcp:control', 'background-access')).toBe(true)
  const signal = new AbortController().signal
  await expect(state.backend.callTool(grant, 'app_conversation', { action: 'read' }, 'id', signal)).rejects.toThrow('Unlock Chatbox')
  const response = state.backend.callTool(grant, 'venice_studio', { action: 'generate' }, 'id', signal)
  const request = f.sender.send.mock.calls.at(-1)![1]
  expect(request).toMatchObject({ name: 'venice_studio', locked: true, grant: { allowOperationsWhileLocked: true } })
  await f.invoke('local-mcp:reply', request.id, { result: 'studio' })
  expect(await response).toBe('studio')
  await f.invoke('local-mcp:control', 'stop-endpoint', grant.endpointId)
  expect(await f.invoke('local-mcp:control', 'background-access')).toBe(false)
})
