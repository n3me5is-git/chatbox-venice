import { createServer,type Server as HTTPServer,type IncomingMessage,type ServerResponse } from 'node:http'
import { randomBytes,randomUUID,timingSafeEqual } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema,ListToolsRequestSchema,ListResourcesRequestSchema,ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { LocalMCPStartSchema,localMCPAllows,type LocalMCPStart,type LocalMCPState,type LocalMCPGrant,type LocalMCPTool } from '../../shared/local-mcp'

export interface LocalMCPBackend {
  listTools(grant:LocalMCPGrant,signal:AbortSignal):Promise<LocalMCPTool[]>
  callTool(grant:LocalMCPGrant,name:string,args:Record<string,unknown>,callId:string,signal:AbortSignal):Promise<unknown>
  listResources(grant:LocalMCPGrant,signal:AbortSignal):Promise<any[]>
  readResource(grant:LocalMCPGrant,uri:string,signal:AbortSignal):Promise<any>
}
function deny(response:ServerResponse,status:number,message:string){if(!response.headersSent)response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32000,message}}))}
/** Explicit, revocable single-chat grants. No LAN bind, browser origins, cookies or persistent tokens. */
export class LocalMCPServer {
  private http:HTTPServer|undefined
  private grant:LocalMCPGrant|undefined
  private pending=new Map<string,AbortController>()
  constructor(private readonly backend:LocalMCPBackend){}
  state():LocalMCPState{return this.grant?structuredClone(this.grant):{running:false}}
  async start(input:LocalMCPStart){
    const parsed=LocalMCPStartSchema.parse(input)
    if(parsed.permissions.execute&&(!parsed.permissions.readFiles||!parsed.permissions.writeFiles))throw new Error('Code execution requires read and write access')
    if(parsed.permissions.automaticModels&&!parsed.permissions.models)throw new Error('Automatic model calls require model access')
    await this.stop()
    const token=randomBytes(32).toString('base64url'),startedAt=Date.now()
    const http=createServer((request,response)=>{void this.handle(request,response).catch(()=>deny(response,500,'Local MCP request failed'))})
    http.maxConnections=16;http.headersTimeout=10000;http.requestTimeout=30000;http.keepAliveTimeout=5000
    this.http=http
    try{await new Promise<void>((resolve,reject)=>{http.once('error',reject);http.listen(parsed.port,'127.0.0.1',()=>{http.off('error',reject);resolve()})})}
    catch(error){this.http=undefined;http.close();throw error}
    const address=http.address();if(!address||typeof address==='string')throw new Error('Local MCP address unavailable')
    this.grant={running:true,sessionId:parsed.sessionId,permissions:parsed.permissions,token,url:'http://127.0.0.1:'+address.port+'/mcp',startedAt}
    return this.state()
  }
  async stop(){
    this.grant=undefined;for(const pending of this.pending.values())pending.abort();this.pending.clear()
    const http=this.http;this.http=undefined
    if(http){http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()))}
  }
  private async handle(request:IncomingMessage,response:ServerResponse){
    const grant=this.grant
    response.setHeader('cache-control','no-store');response.setHeader('x-content-type-options','nosniff')
    if(!grant){deny(response,503,'Local MCP server is stopped');return}
    const expectedHost=new URL(grant.url).host
    if(request.headers.host!==expectedHost||request.headers.origin!==undefined||!['127.0.0.1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress||'')){request.resume();deny(response,403,'Only authorized local clients without a browser origin are accepted');return}
    const authorization=Buffer.from(request.headers.authorization||''),expected=Buffer.from('Bearer '+grant.token)
    if(authorization.length!==expected.length||!timingSafeEqual(authorization,expected)){request.resume();deny(response,401,'A valid local MCP bearer token is required');return}
    if(request.url!=='/mcp'){request.resume();deny(response,404,'Unknown MCP endpoint');return}
    if(request.method!=='POST'){request.resume();deny(response,405,'Use MCP Streamable HTTP POST requests');return}
    if(Number(request.headers['content-length'])>512*1024){request.resume();deny(response,413,'MCP request exceeds the size limit');return}
    const chunks:Buffer[]=[];let length=0
    for await(const chunk of request){length+=chunk.length;if(length>512*1024){deny(response,413,'MCP request exceeds the size limit');return}chunks.push(chunk)}
    let body:any;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{deny(response,400,'Invalid MCP JSON');return}
    if(!body||Array.isArray(body)||typeof body!=='object'){deny(response,400,'Only single MCP messages are accepted');return}
    if(body.method==='notifications/cancelled'){
      this.pending.get(String(body.params?.requestId))?.abort();response.writeHead(202).end();return
    }
    if(this.pending.size>=8){deny(response,429,'Too many local MCP requests');return}
    const requestId=body.id===undefined?randomUUID():String(body.id)
    if(this.pending.has(requestId)){deny(response,409,'This MCP request is already running');return}
    const controller=new AbortController();this.pending.set(requestId,controller)
    const timer=setTimeout(()=>controller.abort(),5*60*1000)
    const server=new Server({name:'chatbox-venice-local',version:'1.0.0'},{capabilities:{tools:{},resources:{}}})
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true})
    const alive=()=>{controller.signal.throwIfAborted();if(this.grant!==grant)throw new Error('Local MCP access was revoked')}
    server.setRequestHandler(ListToolsRequestSchema,async()=>{alive();return {tools:await this.backend.listTools(grant,controller.signal)}})
    server.setRequestHandler(CallToolRequestSchema,async message=>{
      alive();const args=message.params.arguments??{},name=message.params.name
      if(!localMCPAllows(grant.permissions,name,args))return {isError:true,content:[{type:'text',text:'This tool or action is outside the shared chat permissions'}]}
      try{const output=await this.backend.callTool(grant,name,args,'local-mcp:'+grant.startedAt+':'+requestId,controller.signal);alive();const text=JSON.stringify(output??null);if(Buffer.byteLength(text)>16*1024*1024)throw new Error('MCP output exceeds the size limit');return {content:[{type:'text',text}]}}
      catch(error){return {isError:true,content:[{type:'text',text:String((error as Error)?.message||error).slice(0,2000)}]}}
    })
    server.setRequestHandler(ListResourcesRequestSchema,async()=>{alive();return {resources:grant.permissions.readFiles?await this.backend.listResources(grant,controller.signal):[]}})
    server.setRequestHandler(ReadResourceRequestSchema,async message=>{alive();if(!grant.permissions.readFiles)throw new Error('File reading is not allowed');return this.backend.readResource(grant,message.params.uri,controller.signal)})
    const cleanup=()=>{controller.abort();clearTimeout(timer);if(this.pending.get(requestId)===controller)this.pending.delete(requestId);void transport.close().catch(()=>{});void server.close().catch(()=>{})}
    response.once('close',cleanup)
    try{await server.connect(transport);await transport.handleRequest(request,response,body)}catch{cleanup();deny(response,500,'Local MCP transport failed')}
  }
}
