import {app,dialog,ipcMain,type BrowserWindow,type IpcMainInvokeEvent} from 'electron'
import {join} from 'node:path'
import {PaddleOcrWorker} from './worker'
import {extractOcrRuntime} from '../local-ocr/archive'
export function registerPaddleOcrIPC(window:()=>BrowserWindow|null){
 const worker=new PaddleOcrWorker(join(app.getPath('userData'),'paddle-ocr'),{extract:async(archive,directory)=>{await extractOcrRuntime({name:'paddle.zip',url:'',bytes:0,sha256:''},archive,directory,['paddle-ocr-worker.exe'])}})
 let attached:Electron.WebContents|undefined
 const assertOwner=(event:IpcMainInvokeEvent)=>{const owner=window()?.webContents,frame=event.senderFrame;if(!owner||owner!==event.sender||!frame||owner.mainFrame.routingId!==frame.routingId||owner.mainFrame.processId!==frame.processId)throw Error('Untrusted local OCR caller');const url=new URL(frame.url);if(url.protocol!=='file:'&&!(process.env.NODE_ENV==='development'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Untrusted local OCR caller');if(attached!==owner){attached=owner;owner.once('destroyed',()=>{void worker.unload()});owner.on('render-process-gone',()=>{void worker.unload()})}}
 ipcMain.handle('paddle-ocr:control',async(event,command:unknown,value:any)=>{
  assertOwner(event)
  if(command==='status')return worker.status()
  if(command==='configure')return worker.configure(value)
  if(command==='unload'){await worker.unload();return worker.status()}
  if(command==='cancel-download'){worker.cancelTransfer();return}
  if(command==='cancel'){if(typeof value==='string')worker.cancel(value);return}
  if(command==='remove')return worker.remove()
  if(command==='download')return worker.install()
  if(command==='import'){const owner=window();if(!owner)throw Error('The app is unavailable');const selected=await dialog.showOpenDialog(owner,{title:'PaddleOCR',properties:['openFile'],filters:[{name:'PaddleOCR package',extensions:['zip']}]});assertOwner(event);if(selected.canceled||selected.filePaths.length!==1)return worker.status();return worker.install(selected.filePaths[0])}
  if(command==='ocr'){if(!value||typeof value.id!=='string'||!/^[-a-f0-9]{36}$/.test(value.id)||typeof value.modelId!=='string')throw Error('Invalid local OCR request');return worker.ocr(value.id,value.modelId,value.image)}
  throw Error('Unknown local OCR command')
 })
 app.on('before-quit',()=>{void worker.unload()})
}
