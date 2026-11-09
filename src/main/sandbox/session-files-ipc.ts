import { ipcMain, dialog } from 'electron'
import { store } from '../store-node'
import { LinkedFolderBroker } from './linked-folder'
import type { FolderRequest } from '../../shared/linked-folder'
import { sessionDiskFiles, type SessionFilesRequest } from './session-files'

/** File explorer only: no command strings, shell, process creation or arbitrary host paths.
 * The legacy command handlers are unchanged. Only app-managed session files may
 * be mutated by the legacy explorer endpoint. A separately granted folder broker
 * supports native folder changes without arbitrary OS paths. */
export function registerSessionFileIPC(){
  const bindings=(store.get('sessionFolderBindings' as any) || {}) as Record<string,any>
  const folders=new LinkedFolderBroker(bindings,()=>{store.set('sessionFolderBindings' as any,bindings)},async()=>{const result=await dialog.showOpenDialog({properties:['openDirectory','createDirectory']});return result.canceled?undefined:result.filePaths[0]})
  ipcMain.handle('session-folder:operation',async(event,input:FolderRequest)=>{
    const frame=event.senderFrame,main=event.sender.mainFrame
    if(!frame||frame.routingId!==main.routingId||frame.processId!==main.processId)throw Error('Only the app can link folders')
    const url=new URL(frame.url)
    if(url.protocol!=='file:'&&!(process.env.NODE_ENV==='development'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Untrusted workspace caller')
    return folders.operation(input)
  })
  ipcMain.handle('session-files:operation',async(event,request:SessionFilesRequest)=>{
    try{
      const frame=event.senderFrame,main=event.sender.mainFrame
      if(!frame||frame.routingId!==main.routingId||frame.processId!==main.processId)throw new Error('Only the app can access session files')
      const url=new URL(frame.url)
      if(url.protocol!=='file:'&&!(process.env.NODE_ENV==='development'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Untrusted session file caller')
      return {success:true,...await sessionDiskFiles(request)}
    }catch(error){return {success:false,error:error instanceof Error?error.message:String(error),files:[]}}
  })
}
