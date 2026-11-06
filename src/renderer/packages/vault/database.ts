import type { AssetHeader, AssetIndex } from './chunk-store'
const request=<T>(value:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error)})
const complete=(tx:IDBTransaction)=>new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('Vault transaction aborted'));tx.onerror=()=>reject(tx.error)})
export class VaultDatabase implements AssetIndex {
  private opening:Promise<IDBDatabase>|undefined
  constructor(private readonly name='chatbox-private-library-v1'){}
  private db(){return this.opening ||= new Promise<IDBDatabase>((resolve,reject)=>{
    const open=indexedDB.open(this.name,1);let rejected=false
    open.onupgradeneeded=()=>{const db=open.result;const assets=db.createObjectStore('assets',{keyPath:'id'});assets.createIndex('createdAt','createdAt');assets.createIndex('scopeCreated',['scope','createdAt']);const aliases=db.createObjectStore('aliases',{keyPath:'alias'});aliases.createIndex('asset','id');db.createObjectStore('settings',{keyPath:'key'})}
    open.onerror=()=>{rejected=true;this.opening=undefined;reject(open.error)};open.onblocked=()=>{rejected=true;this.opening=undefined;reject(new Error('Close other app windows to initialize encrypted storage'))}
    open.onsuccess=()=>{if(rejected){open.result.close();return}open.result.onversionchange=()=>{open.result.close();this.opening=undefined};resolve(open.result)}
  })}
  async get(id:string){const tx=(await this.db()).transaction('assets');return (await request(tx.objectStore('assets').get(id))) as AssetHeader|undefined || null}
  async byAlias(alias:string){const tx=(await this.db()).transaction(['aliases','assets']);const found=await request(tx.objectStore('aliases').get(alias)) as {alias:string;id:string}|undefined;return found?(await request(tx.objectStore('assets').get(found.id))) as AssetHeader||null:null}
  async put(header:AssetHeader){const tx=(await this.db()).transaction(['assets','aliases'],'readwrite');const done=complete(tx);tx.objectStore('assets').put(header);if(header.alias&&header.status==='ready')tx.objectStore('aliases').put({alias:header.alias,id:header.id});await done}
  async remove(id:string){const tx=(await this.db()).transaction(['assets','aliases'],'readwrite');const done=complete(tx);tx.objectStore('assets').delete(id);const aliases=tx.objectStore('aliases');const keys=aliases.index('asset').getAllKeys(id);keys.onsuccess=()=>{for(const key of keys.result)aliases.delete(key)};await done}
  async page(scope:string|undefined,cursor=0,limit=20,scopeFilter?:ReadonlySet<string>){
    limit=Math.max(1,Math.min(100,limit));cursor=Math.max(0,Math.floor(cursor))
    const tx=(await this.db()).transaction('assets');const store=tx.objectStore('assets');const index=store.index(scope===undefined?'createdAt':'scopeCreated');const range=scope===undefined?undefined:IDBKeyRange.bound([scope,0],[scope,Number.MAX_SAFE_INTEGER])
    return new Promise<{items:AssetHeader[];next:number|null}>((resolve,reject)=>{const items:AssetHeader[]=[];let skipped=0;const value=index.openCursor(range,'prev');value.onerror=()=>reject(value.error);value.onsuccess=()=>{const current=value.result;if(!current){resolve({items,next:null});return}const header=current.value as AssetHeader;if(header.status==='ready'&&(!scopeFilter||scopeFilter.has(header.scope))){if(skipped<cursor)skipped++;else if(items.length===limit){resolve({items,next:cursor+items.length});return}else items.push(header)}current.continue()}})
  }
  async *all(){let after:string|undefined;while(true){const tx=(await this.db()).transaction('assets');const values=await request(tx.objectStore('assets').getAll(after?IDBKeyRange.lowerBound(after,true):undefined,128)) as AssetHeader[];if(!values.length)return;for(const header of values)yield header;after=values[values.length-1].id}}
  async aliases(){const tx=(await this.db()).transaction('aliases');return await request(tx.objectStore('aliases').getAllKeys()) as string[]}
  async scopes(){const tx=(await this.db()).transaction('settings');return (await request(tx.objectStore('settings').getAllKeys())).filter(key=>typeof key==='string'&&key.startsWith('scope:')).map(key=>String(key).slice(6))}
  async getSetting<T>(key:string):Promise<T|null>{const tx=(await this.db()).transaction('settings');const found=await request(tx.objectStore('settings').get(key)) as {value:T}|undefined;return found?.value??null}
  async setSettingIfUnchanged<T>(key:string,expected:T|null,value:T){const tx=(await this.db()).transaction('settings','readwrite'),done=complete(tx),store=tx.objectStore('settings');let changed=false;const found=store.get(key);found.onsuccess=()=>{if(JSON.stringify(found.result?.value??null)===JSON.stringify(expected)){store.put({key,value});changed=true}};await done;return changed}
  async setSetting<T>(key:string,value:T){const tx=(await this.db()).transaction('settings','readwrite');const done=complete(tx);tx.objectStore('settings').put({key,value});await done}
}
