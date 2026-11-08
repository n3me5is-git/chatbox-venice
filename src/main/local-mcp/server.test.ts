import { afterEach,expect,it,vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { request as httpRequest } from 'node:http'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { defaultLocalMCPPermissions,type LocalMCPGrant } from '../../shared/local-mcp'
import { LocalMCPServer,type LocalMCPBackend } from './server'
const running:LocalMCPServer[]=[]
afterEach(async()=>{await Promise.all(running.splice(0).map(server=>server.stop()))})
async function fixture(){
  const backend:LocalMCPBackend={listTools:vi.fn(async()=>[{name:'session_file',description:'Scoped files',inputSchema:{type:'object' as const,properties:{action:{type:'string'}}}}]),callTool:vi.fn(async(grant,_name,args)=>({sessionId:grant.sessionId,action:args.action})),listResources:vi.fn(async()=>[{name:'report.md',uri:'chatbox-session://chat/report',mimeType:'text/markdown'}]),readResource:vi.fn(async(_grant,uri)=>({contents:[{uri,text:'# Local report',mimeType:'text/markdown'}]}))}
  const server=new LocalMCPServer(backend);running.push(server)
  const state=await server.start({sessionId:'chat',port:0,permissions:{...defaultLocalMCPPermissions}}) as LocalMCPGrant
  return {server,backend,state}
}
it('uses a real MCP SDK client over loopback HTTP, with scoped file tools and resources',async()=>{
  const {server,backend,state}=await fixture(),client=new Client({name:'integration-test',version:'1.0'})
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(state.url),{requestInit:{headers:{Authorization:'Bearer '+state.token}}}))
    expect((await client.listTools()).tools.map(tool=>tool.name)).toEqual(['session_file'])
    expect((await client.callTool({name:'session_file',arguments:{action:'read',path:'report.md'}})).isError).not.toBe(true)
    expect(backend.callTool).toHaveBeenCalledWith(expect.objectContaining({sessionId:'chat'}),'session_file',{action:'read',path:'report.md'},expect.stringContaining('local-mcp:'),expect.any(AbortSignal))
    expect((await client.callTool({name:'session_file',arguments:{action:'delete',path:'report.md'}})).isError).toBe(true)
    expect(backend.callTool).toHaveBeenCalledTimes(1)
    expect((await client.listResources()).resources).toHaveLength(1)
    expect((await client.readResource({uri:'chatbox-session://chat/report'})).contents[0]).toMatchObject({text:'# Local report'})
  }finally{await client.close();await server.stop()}
  expect(server.state()).toEqual({running:false})
})
it('rejects browser origins, rebinding Host, absent/invalid tokens, oversized bodies and batches before invoking app tools',async()=>{
  const {state,backend}=await fixture(),headers={Authorization:'Bearer '+state.token,'content-type':'application/json',accept:'application/json, text/event-stream'},body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})
  expect((await fetch(state.url,{method:'POST',body})).status).toBe(401)
  expect((await fetch(state.url,{method:'POST',headers:{...headers,Authorization:'Bearer wrong'},body})).status).toBe(401)
  expect((await fetch(state.url,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body})).status).toBe(403)
  const rebinding=await new Promise<number|undefined>((resolve,reject)=>{const request=httpRequest(state.url,{method:'POST',headers:{...headers,Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject);request.end(body)})
  expect(rebinding).toBe(403)
  expect((await fetch(state.url,{method:'POST',headers,body:'['+body+']'})).status).toBe(400)
  expect((await fetch(state.url,{method:'POST',headers,body:'x'.repeat(513*1024)})).status).toBe(413)
  expect(backend.listTools).not.toHaveBeenCalled();expect(backend.callTool).not.toHaveBeenCalled()
})
it('revokes the old token on restart and aborts an active tool when stopped',async()=>{
  const {server,state,backend}=await fixture()
  const second=await server.start({sessionId:'chat',port:Number(new URL(state.url).port),permissions:{...defaultLocalMCPPermissions}}) as LocalMCPGrant
  expect(second.token).not.toBe(state.token)
  expect((await fetch(second.url,{method:'POST',headers:{Authorization:'Bearer '+state.token},body:'{}'})).status).toBe(401)
  let received:AbortSignal|undefined
  backend.callTool=vi.fn(async(_grant,_name,_args,_id,signal)=>{received=signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}))})
  const client=new Client({name:'cancel-test',version:'1.0'})
  await client.connect(new StreamableHTTPClientTransport(new URL(second.url),{requestInit:{headers:{Authorization:'Bearer '+second.token}}}))
  const call=client.callTool({name:'session_file',arguments:{action:'read'}}).catch(()=>null)
  await vi.waitFor(()=>expect(received).toBeDefined());await server.stop();expect(received?.aborted).toBe(true);await call;await client.close()
})
