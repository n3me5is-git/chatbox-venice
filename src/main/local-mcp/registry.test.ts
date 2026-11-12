import {afterEach,expect,it,vi} from 'vitest'
import {defaultLocalMCPPermissions,LocalMCPApplicationSchema,type LocalMCPGrant} from '../../shared/local-mcp'
import {LocalMCPRegistry} from './registry'
let registry:LocalMCPRegistry
const headers=(token:string)=>({Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'})
afterEach(async()=>{await registry?.stopAll()})
it('runs independent real loopback listeners and rejects cross-port tokens without revoking another endpoint',async()=>{
  const revoked=vi.fn(),backend={listTools:vi.fn(async()=>[]),callTool:vi.fn(async()=>({ok:true})),listResources:vi.fn(async()=>[]),readResource:vi.fn(async()=>({contents:[]}))}
  registry=new LocalMCPRegistry(backend,revoked)
  const start=(name:string)=>registry.start({sessionId:'application',endpointId:crypto.randomUUID(),application:LocalMCPApplicationSchema.parse({mode:'router',name}),permissions:{...defaultLocalMCPPermissions,models:true},port:0}) as Promise<LocalMCPGrant>
  const first=await start('Research'),second=await start('Studio')
  expect(first.url).not.toBe(second.url);expect(first.token).not.toBe(second.token);expect(registry.list()).toHaveLength(2)
  expect((await fetch(first.url,{method:'POST',headers:headers(second.token),body:'{}'})).status).toBe(401)
  await registry.stop(first.endpointId);expect(revoked).toHaveBeenCalledWith(first);expect(registry.state(second.endpointId)).toMatchObject({running:true,token:second.token})
  expect((await fetch(second.url,{method:'POST',headers:headers(second.token),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})).status).toBe(200)
  expect(backend.listTools).toHaveBeenCalledWith(expect.objectContaining({application:expect.objectContaining({name:'Studio'})}),expect.any(AbortSignal))
})
it('preserves a running endpoint when a new listener cannot bind its requested port',async()=>{
  registry=new LocalMCPRegistry({listTools:async()=>[],callTool:async()=>null,listResources:async()=>[],readResource:async()=>null})
  const config={sessionId:'application',endpointId:crypto.randomUUID(),application:LocalMCPApplicationSchema.parse({mode:'shadow',name:'One'}),permissions:defaultLocalMCPPermissions,port:0}
  const first=await registry.start(config) as LocalMCPGrant
  await expect(registry.start({...config,endpointId:crypto.randomUUID(),port:Number(new URL(first.url).port)})).rejects.toThrow()
  expect(registry.list()).toHaveLength(1);expect(registry.state(first.endpointId)).toMatchObject({token:first.token})
})
