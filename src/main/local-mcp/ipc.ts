import { app,ipcMain,type BrowserWindow,type IpcMainInvokeEvent,type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { LocalMCPServer } from './server'
import { LocalMCPStartSchema,type LocalMCPRequest,type LocalMCPGrant } from '../../shared/local-mcp'

export function registerLocalMCPIPC(window:()=>BrowserWindow|null){
  let owner:WebContents|undefined
  let releaseOwner=()=>{}
  let controlQueue:Promise<unknown>=Promise.resolve()
  const pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;cancel:()=>void}>()
  function assertApp(event:IpcMainInvokeEvent){
    const main=window()?.webContents,frame=event.senderFrame
    if(!main||event.sender!==main||!frame||frame.routingId!==main.mainFrame.routingId||frame.processId!==main.mainFrame.processId)throw new Error('Only the main app can control the local MCP server')
    const url=new URL(frame.url)
    if(url.protocol!=='file:'&&!(process.env.NODE_ENV==='development'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('Untrusted local MCP caller')
  }
  async function invoke(grant:LocalMCPGrant,operation:LocalMCPRequest['operation'],signal:AbortSignal,params:Partial<LocalMCPRequest>={}){
    signal.throwIfAborted();const target=owner;if(!target||target.isDestroyed())throw new Error('The app is unavailable')
    const id=randomUUID()
    return new Promise<any>((resolve,reject)=>{
      const cancel=()=>{pending.delete(id);if(!target.isDestroyed())target.send('local-mcp:request',{id,operation:'cancel',grant});reject(new Error('Local MCP request cancelled'))}
      pending.set(id,{resolve,reject,cancel});signal.addEventListener('abort',cancel,{once:true})
      target.send('local-mcp:request',{id,operation,grant,...params})
    }).finally(()=>{const item=pending.get(id);if(item)signal.removeEventListener('abort',item.cancel);pending.delete(id)})
  }
  const server=new LocalMCPServer({listTools:(grant,signal)=>invoke(grant,'list_tools',signal),callTool:(grant,name,args,callId,signal)=>invoke(grant,'call_tool',signal,{name,arguments:args,callId}),listResources:(grant,signal)=>invoke(grant,'list_resources',signal),readResource:(grant,uri,signal)=>invoke(grant,'read_resource',signal,{uri})})
  const stop=async()=>{releaseOwner();releaseOwner=()=>{};await server.stop();for(const item of pending.values())item.cancel();pending.clear();owner=undefined}
  ipcMain.handle('local-mcp:control',async(event,command:'start'|'stop'|'status',input:unknown)=>{
    assertApp(event)
    if(command==='status')return server.state()
    const operation=controlQueue.catch(()=>{}).then(async()=>{
      assertApp(event)
      if(command==='stop'){await stop();return server.state()}
      if(command!=='start')throw new Error('Unknown local MCP command')
      const config=LocalMCPStartSchema.parse(input);await stop();owner=event.sender
      const state=await server.start(config)
      const target=owner,closed=()=>{if(owner===target)void stop()};target.once('destroyed',closed);releaseOwner=()=>{if(!target.isDestroyed())target.removeListener('destroyed',closed)}
      return state
    });controlQueue=operation;return operation
  })
  ipcMain.handle('local-mcp:reply',async(event,id:unknown,value:any)=>{
    assertApp(event);if(!owner)return;if(event.sender!==owner||typeof id!=='string')throw new Error('Untrusted local MCP reply')
    const item=pending.get(id);if(!item)return
    if(typeof value!=='object'||!value||Buffer.byteLength(JSON.stringify(value))>16*1024*1024){item.reject(new Error('Invalid local MCP response'));return}
    if(value.error)item.reject(new Error(String(value.error).slice(0,2000)));else item.resolve(value.result)
  })
  app.on('before-quit',()=>{void stop()})
}
