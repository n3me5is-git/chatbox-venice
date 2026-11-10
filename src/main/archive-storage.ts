import { app,dialog,ipcMain,type BrowserWindow,type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { setArchiveBlobBridge } from './archive-blob-bridge'
const validName=(name:unknown):name is string=>typeof name==='string'&&/^a1-[a-f0-9-]{36}-\d{1,9}\.bin$/.test(name)
export class DesktopArchiveRoots {
  constructor(private readonly profile:string){}
  private async registry():Promise<Record<string,string>>{try{return JSON.parse(await fs.readFile(path.join(this.profile,'archive-roots.json'),'utf8'))}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {};throw error}}
  private async save(roots:Record<string,string>){const file=path.join(this.profile,'archive-roots.json');await fs.mkdir(this.profile,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(roots),{mode:0o600});await fs.rename(file+'.tmp',file)}
  async pick(parent:string,reconnect?:string){const roots=await this.registry(),id=reconnect||randomUUID();if(reconnect&&!roots[id])throw new Error('Unknown archive location');const base=await fs.realpath(parent),root=path.join(base,'Chatbox-Archive-'+id)
    if(!reconnect){await fs.mkdir(root);await fs.writeFile(path.join(root,'archive-id'),id,{flag:'wx',mode:0o600})}else if(await fs.readFile(path.join(root,'archive-id'),'utf8')!==id)throw new Error('Choose the original archive folder’s parent')
    roots[id]=root;await this.save(roots);await this.check(id);return {id,name:root}
  }
  private async resolve(id:string){const root=(await this.registry())[id];if(!root)throw new Error('Archive storage is unavailable');const info=await fs.lstat(root);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(root)!==root)throw new Error('Archive folder changed');const marker=path.join(root,'archive-id');if((await fs.lstat(marker)).isSymbolicLink()||await fs.readFile(marker,'utf8')!==id)throw new Error('Archive folder identity changed');return root}
  async check(id:string){await this.resolve(id)}
  async status(id:string){if(id==='internal')return {available:true,name:this.profile};try{const root=await this.resolve(id);return {available:true,name:root}}catch{return {available:false,name:(await this.registry())[id]||''}}}
  async operation(id:string,action:'read'|'write'|'remove',name:string,value?:string){if(!validName(name))throw new Error('Invalid archive filename');const root=await this.resolve(id),file=path.join(root,name)
    try{const info=await fs.lstat(file);if(info.isSymbolicLink()||!info.isFile())throw new Error('Invalid archive file')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(action==='read')return null;if(action==='remove')return null}
    if(action==='read'){if((await fs.stat(file)).size>1024*1024)throw new Error('Archive block exceeds size limit');return fs.readFile(file,'utf8')}
    if(action==='write'){if(typeof value!=='string'||Buffer.byteLength(value)>1024*1024)throw new Error('Archive block exceeds size limit');const handle=await fs.open(file,'wx',0o600);try{await handle.writeFile(value,'utf8');await handle.sync()}finally{await handle.close()}return null}
    await fs.unlink(file);return null
  }
}
export function registerArchiveStorageIpc(window:()=>BrowserWindow|null){const roots=new DesktopArchiveRoots(app.getPath('userData'))
  const pending=new Map<string,{sender:number;resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
  const trusted=(event:IpcMainInvokeEvent)=>{const current=window();if(!current||event.sender!==current.webContents||event.senderFrame!==current.webContents.mainFrame)throw new Error('Archive storage is available only to the app window');const url=new URL(event.senderFrame.url);if(url.protocol==='file:'){if(path.resolve(fileURLToPath(url)).toLowerCase()!==path.resolve(__dirname,'../renderer/index.html').toLowerCase())throw new Error('Untrusted app document')}else if(app.isPackaged||!process.env.ELECTRON_RENDERER_URL||url.origin!==new URL(process.env.ELECTRON_RENDERER_URL).origin)throw new Error('Untrusted app origin')}
  ipcMain.handle('archive:pick',async(event,reconnect?:string)=>{trusted(event);const current=window()!;const result=await dialog.showOpenDialog(current,{properties:['openDirectory','createDirectory']});if(result.canceled)return null;return roots.pick(result.filePaths[0],reconnect)})
  ipcMain.handle('archive:active',async(event,active:boolean)=>{trusted(event);if(typeof active!=='boolean')throw new Error('Invalid archive state');setArchiveBlobBridge(active?request=>new Promise((resolve,reject)=>{const id=randomUUID(),current=window()!;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Archive content request timed out'))},30000);pending.set(id,{sender:current.webContents.id,resolve,reject,timer});current.webContents.send('archive:blob-request',{...request,id})}):undefined)})
  ipcMain.handle('archive:blob-reply',async(event,id:string,error:string|null,value:unknown)=>{trusted(event);const item=pending.get(id);if(!item||item.sender!==event.sender.id)throw new Error('Unknown archive content request');pending.delete(id);clearTimeout(item.timer);if(error)item.reject(new Error(String(error).slice(0,1000)));else item.resolve(value)})
  ipcMain.handle('archive:status',async(event,id:string)=>{trusted(event);return roots.status(id)})
  ipcMain.handle('archive:operation',async(event,id:string,action:'read'|'write'|'remove',name:string,value?:string)=>{trusted(event);if(!['read','write','remove'].includes(action))throw new Error('Invalid archive operation');return roots.operation(id,action,name,value)})
}
