import {app,dialog,ipcMain,type BrowserWindow,type IpcMainInvokeEvent} from 'electron'
import {join} from 'node:path'
import {LocalOcrWorker} from './worker'
import {extractOcrRuntime} from './archive'
export function registerLocalOcrIPC(window:()=>BrowserWindow|null){
 const worker=new LocalOcrWorker(join(app.getPath('userData'),'local-ocr'),{extract:extractOcrRuntime})
 let attached:Electron.WebContents|undefined
 const assertOwner=(event:IpcMainInvokeEvent)=>{const owner=window()?.webContents,frame=event.senderFrame;if(!owner||owner!==event.sender||!frame||owner.mainFrame.routingId!==frame.routingId||owner.mainFrame.processId!==frame.processId)throw Error('Untrusted local OCR caller');if(attached!==owner){attached=owner;owner.once('destroyed',()=>{void worker.unload()});owner.on('render-process-gone',()=>{void worker.unload()})}const url=new URL(frame.url);if(url.protocol!=='file:'&&!(process.env.NODE_ENV==='development'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Untrusted local OCR caller')}
 ipcMain.handle('local-ocr:control',async(event,command:unknown,value:any)=>{
  assertOwner(event)
  if(command==='status')return worker.status()
  if(command==='configure')return worker.configure(value)
  if(command==='unload'){await worker.unload();return worker.status()}
  if(command==='cancel-download'){worker.cancelTransfer();return}
  if(command==='cancel'){if(typeof value==='string')worker.cancel(value);return}
  if(command==='remove'){if(!['q4','q8','projector'].includes(value))throw Error('Invalid local OCR file');return worker.remove(value)}
  if(command==='download-package'){if(!['q4','q8'].includes(value))throw Error('Invalid local OCR file');if(!(await worker.status()).runtime)await worker.install('runtime');await worker.install('projector');return worker.install(value)}
  if(command==='download'){if(!['q4','q8','projector','runtime'].includes(value))throw Error('Invalid local OCR file');return worker.install(value)}
  if(command==='import'){if(!['q4','q8','projector'].includes(value))throw Error('Invalid local OCR file');const owner=window();if(!owner)throw Error('The app is unavailable');const chosen=await dialog.showOpenDialog(owner,{title:'MiniCPM-OCR GGUF',properties:['openFile'],filters:[{name:'GGUF',extensions:['gguf']}]});assertOwner(event);if(chosen.canceled||chosen.filePaths.length!==1)return worker.status();return worker.install(value,chosen.filePaths[0])}
  if(command==='ocr'){if(!value||typeof value.id!=='string'||!/^[-a-f0-9]{36}$/.test(value.id)||typeof value.modelId!=='string')throw Error('Invalid local OCR request');return worker.ocr(value.id,value.modelId,value.image)}
  throw Error('Unknown local OCR command')
 })
 app.on('before-quit',()=>{void worker.unload()})
}
