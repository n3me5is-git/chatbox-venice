import { emptyResourceIndex, MAX_RESOURCE_FILE_BYTES, resourceMime, resourceName, sessionFilePath, type SessionFile, type SessionResourceIndex } from './session-resources'

export interface SessionFileStorage {
  assertAccess(sessionId: string): Promise<void>
  loadIndex(sessionId: string, managed?: boolean): Promise<SessionResourceIndex | null>
  saveIndex(sessionId: string, index: SessionResourceIndex, managed?:boolean): Promise<void>
  read(key: string): Promise<Uint8Array>
  put(sessionId: string, key: string, bytes: Uint8Array, file: SessionFile, options?: { expectedVersion: string|null }): Promise<void|{key:string;id?:string}>
  remove(key: string): Promise<void>
  /** Remove an obsolete immutable blob; external mutable files must be retained. */
  discard?(key:string):Promise<void>
  describe?(key: string, file: SessionFile): Promise<void>
}
/** Metadata stays separate from bytes. Serial writes never overwrite a sibling file. */
export class SessionFileStore {
  private queues = new Map<string, Promise<unknown>>()
  constructor(private readonly storage: SessionFileStorage) {}
  private async edit<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve()
    const pending = previous.catch(() => {}).then(async () => { await this.storage.assertAccess(id); return operation() })
    this.queues.set(id, pending)
    try { return await pending } finally { if (this.queues.get(id) === pending) this.queues.delete(id) }
  }
  async index(id: string, managed=false) {
    await this.storage.assertAccess(id)
    const index = await (managed?this.storage.loadIndex(id,true):this.storage.loadIndex(id)) ?? emptyResourceIndex()
    if (index.version !== 1 || !Array.isArray(index.files) || !Array.isArray(index.removed)) throw new Error('Invalid session resource index')
    await this.storage.assertAccess(id)
    return index
  }
  async list(id: string, managed=false) { return (await this.index(id,managed)).files }
  async mkdir(id: string, path: string) {
    sessionFilePath(path)
    return this.edit(id, async () => { const index = await this.index(id); if (index.files.some(file => file.path === path || path.startsWith(file.path + '/'))) throw Error('A file already exists at this path'); const directories = [...new Set([...(index.directories || []), path])]; if (directories.length > 2048) throw Error('Session folder count limit reached'); await this.storage.saveIndex(id, { ...index, directories }) })
  }
  async read(id: string, path: string, managed=false) {
    const file = (await this.list(id,managed)).find(item => item.path === sessionFilePath(path))
    if (!file) throw new Error('Session file not found')
    const bytes = await this.storage.read(file.key)
    await this.storage.assertAccess(id)
    return { file, bytes:file.bytes === 0 ? new Uint8Array() : bytes }
  }
  async write(id: string, path: string, bytes: Uint8Array, options: { deliverable?: boolean; mime?: string; expectedVersion?: string | null; managed?:boolean } = {}) {
    sessionFilePath(path)
    if (bytes.length > MAX_RESOURCE_FILE_BYTES) throw new Error('Session files must not exceed 10 MB')
    return this.edit(id, async () => {
      const index = await this.index(id,options.managed), previous = index.files.find(file => file.path === path)
      if (options.expectedVersion !== undefined && (previous?.key ?? null) !== options.expectedVersion) throw Error('This file changed. Read the current version before writing again.')
      if (index.directories?.some(directory => directory === path || directory.startsWith(path + '/')) || index.files.some(file => file.path.startsWith(path + '/') || path.startsWith(file.path + '/'))) throw Error('A file or folder already exists at this path')
      if (!previous && index.files.length >= 2048) throw new Error('Session file count limit reached')
      const total = index.files.reduce((n,file) => n + (file.path === path ? 0 : file.bytes ?? 0), 0) + bytes.length
      if (total > 512 * 1024 * 1024) throw new Error('Session file storage limit reached')
      const key = 'session-file:' + encodeURIComponent(id) + ':' + crypto.randomUUID()
      const file: SessionFile = { id: previous?.id ?? crypto.randomUUID(), origin:'file', path, name:resourceName(path), key, mime:options.mime ?? resourceMime(path), bytes:bytes.length, deliverable:options.deliverable ?? previous?.deliverable ?? false, updatedAt:Date.now() }
      const stored=await this.storage.put(id, key, bytes, file,{expectedVersion:previous?.key??null});if(stored){file.key=stored.key;file.id=stored.id??file.id}
      try { await this.storage.assertAccess(id); await this.storage.saveIndex(id, { ...index, files:[...index.files.filter(item => item.path !== path),file] },options.managed) }
      catch (error) { await (this.storage.discard?.(file.key)??this.storage.remove(file.key)).catch(() => {}); throw error }
      if (previous&&previous.key!==file.key) await (this.storage.discard?.(previous.key)??this.storage.remove(previous.key)).catch(() => {})
      return file
    })
  }
  async deliver(id: string, path: string, deliverable = true) {
    return this.edit(id, async () => {
      const index = await this.index(id), file = index.files.find(item => item.path === sessionFilePath(path))
      if (!file) throw new Error('Session file not found')
      if(file.key.startsWith('linked:')&&deliverable){
        if(index.files.length>=2048||index.files.reduce((n,f)=>n+(f.bytes||0),0)+(file.bytes||0)>512*1024*1024)throw Error('Session file storage limit reached')
        const bytes=Uint8Array.from(await this.storage.read(file.key)),copyId=crypto.randomUUID(),copy:SessionFile={...file,id:copyId,path:'.chatbox/deliverables/'+copyId+'/'+file.name.slice(-120),key:'session-file:'+encodeURIComponent(id)+':'+copyId,deliverable:true,updatedAt:Date.now()}
        try{await this.storage.assertAccess(id);await this.storage.put(id,copy.key,bytes,copy,{expectedVersion:null});await this.storage.saveIndex(id,{...index,files:[...index.files,copy]});return copy}catch(error){await (this.storage.discard?.(copy.key)??this.storage.remove(copy.key)).catch(()=>{});throw error}finally{bytes.fill(0)}
      }
      const next = {...file,deliverable}
      await this.storage.describe?.(next.key,next)
      try { await this.storage.saveIndex(id,{...index,files:index.files.map(item=>item.id===next.id?next:item)}) }
      catch(error){await this.storage.describe?.(file.key,file).catch(()=>{});throw error}
      return next
    })
  }
  async remove(id: string, resourceId: string,relatedIds:string[] = [],managed=false) {
    return this.edit(id, async () => {
      const index = await this.index(id,managed), file = index.files.find(item => item.id === resourceId)
      if (file) await this.storage.remove(file.key)
      await this.storage.saveIndex(id,{...index,files:index.files.filter(item=>item.id!==resourceId),removed:[...new Set([...index.removed,resourceId,...relatedIds])].slice(-10000)},managed)
    })
  }
  async rag(id:string,enabled:boolean){await this.edit(id,async()=>{await this.storage.saveIndex(id,{...await this.index(id,true),ragEnabled:enabled},true)})}
  async python(id: string, enabled: boolean) {
    await this.edit(id, async () => { await this.storage.saveIndex(id,{...await this.index(id),pythonEnabled:enabled}) })
  }
  async tools(id:string,enabled:boolean){
    await this.edit(id,async()=>{await this.storage.saveIndex(id,{...await this.index(id),toolsEnabled:enabled})})
  }
  /** Adopt already encrypted, verified archive copies without replacing existing paths. */
  async adopt(id:string,incoming:SessionFile[],options:{transferredMedia?:boolean}={}){
    return this.edit(id,async()=>{
      const index=await this.index(id),files=[...index.files]
      for(const file of incoming){sessionFilePath(file.path);if(files.some(item=>item.path===file.path))throw new Error('A file already exists at this path');const limit=options.transferredMedia&&/^(image|audio|video)\//.test(file.mime)?128*1024*1024:MAX_RESOURCE_FILE_BYTES;if((file.bytes??0)>limit)throw new Error('Session file exceeds the storage limit');files.push(file)}
      if(files.length>2048||files.reduce((sum,file)=>sum+(file.bytes??0),0)>512*1024*1024)throw new Error('Session file storage limit reached')
      await this.storage.saveIndex(id,{...index,files})
    })
  }
  /** Publish execution changes together, after checking for edits made while code ran. */
  async commit(id:string,changes:Record<string,Uint8Array>,baseline:Record<string,string>,signal:AbortSignal){
    return this.edit(id,async()=>{
      signal.throwIfAborted()
      const index=await this.index(id),files=[...index.files],created:string[]=[],obsolete:string[]=[]
      for(const [path,bytes]of Object.entries(changes)){
        sessionFilePath(path)
        if(bytes.length>MAX_RESOURCE_FILE_BYTES)throw new Error('Session files must not exceed 10 MB')
        if(files.find(file=>file.path===path)?.key!==(Object.hasOwn(baseline,path)?baseline[path]:undefined))throw new Error('Session files changed during execution. Inspect them before retrying.')
      }
      try{
        for(const [path,bytes]of Object.entries(changes)){
          signal.throwIfAborted();const previous=files.find(file=>file.path===path)
          const key='session-file:'+encodeURIComponent(id)+':'+crypto.randomUUID()
          const file:SessionFile={id:previous?.id??crypto.randomUUID(),origin:'file',path,name:resourceName(path),key,mime:previous?.mime??resourceMime(path),bytes:bytes.length,deliverable:previous?.deliverable??false,updatedAt:Date.now()}
          const stored=await this.storage.put(id,key,bytes,file,{expectedVersion:previous?.key??null});if(stored){file.key=stored.key;file.id=stored.id??file.id}created.push(file.key)
          if(previous){obsolete.push(previous.key);files.splice(files.indexOf(previous),1)}
          files.push(file)
        }
        if(files.length>2048||files.reduce((total,file)=>total+(file.bytes??0),0)>512*1024*1024)throw new Error('Session file storage limit reached')
        signal.throwIfAborted();await this.storage.assertAccess(id);await this.storage.saveIndex(id,{...index,files})
      }catch(error){for(const key of created)await (this.storage.discard?.(key)??this.storage.remove(key)).catch(()=>{});throw error}
      for(const key of obsolete)await (this.storage.discard?.(key)??this.storage.remove(key)).catch(()=>{})
    })
  }
}
