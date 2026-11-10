import { Capacitor,registerPlugin } from '@capacitor/core'
import type { ArchiveDisk } from './engine'
export interface ArchiveLocation {id:string;name:string}
interface NativeArchive {pick(options:{reconnect?:string}):Promise<ArchiveLocation|undefined>;status(options:{id:string}):Promise<{available:boolean;name:string}>;operation(options:{id:string;action:'read'|'write'|'remove';name:string;value?:string}):Promise<{value?:string|null}>}
const plugin=registerPlugin<NativeArchive>('ArchiveStorage')
export const archiveStorageSupported=()=>typeof window!=='undefined'&&!!window.electronAPI||Capacitor.getPlatform()==='android'
export class NativeArchiveDisk implements ArchiveDisk {
  constructor(private readonly internal:{get:(key:string)=>Promise<string|null>;set:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>}){}
  async pick(reconnect?:string):Promise<ArchiveLocation|null>{return (typeof window!=='undefined'&&window.electronAPI?await window.electronAPI.invoke('archive:pick',reconnect):await plugin.pick({reconnect}))||null}
  async status(root:string){if(root==='internal')return typeof window!=='undefined'&&window.electronAPI?window.electronAPI.invoke('archive:status',root):{available:true,name:'Internal storage'};return typeof window!=='undefined'&&window.electronAPI?window.electronAPI.invoke('archive:status',root):plugin.status({id:root})}
  async check(root:string){if(root!=='internal'&&!(await this.status(root)).available)throw new Error('Archive storage is unavailable')}
  private async operation(root:string,action:'read'|'write'|'remove',name:string,value?:string){if(typeof window!=='undefined'&&window.electronAPI)return window.electronAPI.invoke('archive:operation',root,action,name,value);return (await plugin.operation({id:root,action,name,value})).value??null}
  async read(root:string,name:string){return root==='internal'?this.internal.get(name):this.operation(root,'read',name)}
  async write(root:string,name:string,value:string){if(root==='internal')await this.internal.set(name,value);else await this.operation(root,'write',name,value)}
  async remove(root:string,name:string){if(root==='internal')await this.internal.remove(name);else await this.operation(root,'remove',name)}
}
