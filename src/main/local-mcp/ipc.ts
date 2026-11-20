import { app,ipcMain,type BrowserWindow,type IpcMainInvokeEvent,type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { LocalMCPRegistry } from './registry'
import { localMCPAllowsDuringLock,LocalMCPRestoreSchema,LocalMCPStartSchema,type LocalMCPRequest,type LocalMCPGrant } from '../../shared/local-mcp'

export function registerLocalMCPIPC(window:()=>BrowserWindow|null){
  let owner:WebContents|undefined
  let releaseOwner=()=>{}
  let controlQueue:Promise<unknown>=Promise.resolve()
  let suspended=false
  let locked=false
  let suspensionVersion=0
  const pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;cancel:()=>void;token:string}>()
  function assertApp(event:IpcMainInvokeEvent){
    const main=window()?.webContents,frame=event.senderFrame
    if(!main||event.sender!==main||!frame||frame.routingId!==main.mainFrame.routingId||frame.processId!==main.mainFrame.processId)throw new Error('Only the main app can control the local MCP server')
    const url=new URL(frame.url)
    if(url.protocol!=='file:'&&!(process.env.NODE_ENV==='development'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('Untrusted local MCP caller')
  }
  async function invoke(grant:LocalMCPGrant,operation:LocalMCPRequest['operation'],signal:AbortSignal,params:Partial<LocalMCPRequest>={}){
    if(suspended&&(!locked||!localMCPAllowsDuringLock(grant,operation,params.name)))throw Error('Unlock Chatbox to use this MCP operation')
    signal.throwIfAborted();const target=owner;if(!target||target.isDestroyed())throw new Error('The app is unavailable')
    const id=randomUUID()
    return new Promise<any>((resolve,reject)=>{
      const cancel=()=>{pending.delete(id);if(!target.isDestroyed())target.send('local-mcp:request',{id,operation:'cancel',grant});reject(new Error('Local MCP request cancelled'))}
      pending.set(id,{resolve,reject,cancel,token:grant.token});signal.addEventListener('abort',cancel,{once:true})
      target.send('local-mcp:request',{id,operation,grant,...params,locked:suspended&&locked})
    }).finally(()=>{const item=pending.get(id);if(item)signal.removeEventListener('abort',item.cancel);pending.delete(id)})
  }
  const registry=new LocalMCPRegistry({listTools:(grant,signal)=>invoke(grant,'list_tools',signal),callTool:(grant,name,args,callId,signal)=>invoke(grant,'call_tool',signal,{name,arguments:args,callId}),listResources:(grant,signal)=>invoke(grant,'list_resources',signal),readResource:(grant,uri,signal)=>invoke(grant,'read_resource',signal,{uri})},grant=>{if(owner&&!owner.isDestroyed())owner.send('local-mcp:request',{id:randomUUID(),operation:'revoke',grant});for(const item of pending.values())if(item.token===grant.token)item.cancel()})
  const stop=async()=>{await registry.stopAll();releaseOwner();releaseOwner=()=>{};for(const item of pending.values())item.cancel();pending.clear();owner=undefined}
  ipcMain.handle('local-mcp:control',async(event,command:string,input:unknown)=>{
    assertApp(event)
    if(command==='list')return registry.list()
    if(command==='status')return registry.state(typeof input==='string'?input:undefined)
    if(command==='list-shares')return registry.shares()
    if(command==='chat-status'&&typeof input==='string')return registry.chatState(input)
    // Close admission immediately, even if a prior start is still binding a port.
    if(command==='suspend'){suspended=true;locked=input===true;suspensionVersion++}
    const version=suspensionVersion
    const operation=controlQueue.catch(()=>{}).then(async()=>{
      assertApp(event)
      if(command==='suspend'){
        for(const item of pending.values())item.cancel()
        if(input===true)await registry.suspendForLock();else await stop()
        return {running:false}
      }
      if(command==='stop-all'){await stop();return {running:false}}
      if(command==='resume'){if(version===suspensionVersion){suspended=false;locked=false};return {running:false}}
      if(command==='stop-shares'){await registry.stopShares();return {running:false}}
      if(command==='stop-chat'&&typeof input==='string'){await registry.stop('chat:'+input);return {running:false}}
      if(command==='stop'||command==='stop-endpoint'){
        if(command==='stop-endpoint'&&typeof input!=='string')throw Error('Choose an MCP endpoint')
        await registry.stop(typeof input==='string'?input:undefined);return {running:false}
      }
      if(command!=='start'&&command!=='restore')throw new Error('Unknown local MCP command')
      if(suspended)throw Error('Unlock Chatbox to start local MCP servers')
      const restored=command==='restore'?LocalMCPRestoreSchema.parse(input):undefined
      const config=restored?.config??LocalMCPStartSchema.parse(input)
      if(!owner){
        owner=event.sender
        const target=owner,closed=()=>{if(owner===target)void stop()};target.once('destroyed',closed)
        releaseOwner=()=>{if(!target.isDestroyed())target.removeListener('destroyed',closed)}
      }
      const started=await registry.start(config,restored?.accessToken)
      if(suspended){await registry.stop(config.application?config.endpointId:'chat:'+config.sessionId);throw Error('Unlock Chatbox to start local MCP servers')}
      return started
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
