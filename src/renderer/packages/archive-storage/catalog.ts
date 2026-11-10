import type { ArchiveCatalog,ArchiveEntry,ArchiveState } from './engine'
export class IndexedArchiveCatalog implements ArchiveCatalog {
  private db?:Promise<IDBDatabase>
  private open(){return this.db ||= new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('chatbox-archive-catalog-v1',1);request.onupgradeneeded=()=>{request.result.createObjectStore('entries',{keyPath:'key'});request.result.createObjectStore('settings')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
  private async request<T>(store:string,mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const request=run(tx.objectStore(store));tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(tx.error)})}
  async state(){return await this.request<ArchiveState|undefined>('settings','readonly',s=>s.get('state'))||{root:'internal'}}
  async setState(state:ArchiveState){await this.request('settings','readwrite',s=>s.put(state,'state'))}
  get(key:string){return this.request<ArchiveEntry|undefined>('entries','readonly',s=>s.get(key))}
  async put(entry:ArchiveEntry){await this.request('entries','readwrite',s=>s.put(entry))}
  async remove(key:string){await this.request('entries','readwrite',s=>s.delete(key))}
  entries(){return this.request<ArchiveEntry[]>('entries','readonly',s=>s.getAll())}
  async publish(entries:ArchiveEntry[],state:ArchiveState){const db=await this.open();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(['entries','settings'],'readwrite');for(const entry of entries)tx.objectStore('entries').put(entry);tx.objectStore('settings').put(state,'state');tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error)})}
}
