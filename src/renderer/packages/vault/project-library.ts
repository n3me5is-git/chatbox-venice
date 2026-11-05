import type { SessionMetaRepositoryPort,SessionRowStorePort } from '@chatbox/core/ports'
import { collectHeaderResourceReferences,collectMessageReferences,iterateRowResourceReferences,type ResourceReference } from '@chatbox/core/resources'
import type { Message,SessionHeader } from '@shared/types'
import { getMessageText } from '@shared/utils/message'

/** Trusted metadata-only scan; never reads attachment/media bodies. Uses original ports, not guarded UI ports. */
export function projectLibrary(metadata:SessionMetaRepositoryPort,rows:SessionRowStorePort,readValue:(key:string)=>Promise<unknown>){
  const sessions=async(folders:ReadonlySet<string>)=>{await metadata.initialize();return (await metadata.getAllIncludingHidden()).filter(meta=>meta.folderId&&folders.has(meta.folderId))}
  async function* legacyMessages(value:unknown):AsyncGenerator<Message>{
    if(!value||typeof value!=='object')return
    const seen=new WeakSet<object>(),pending:unknown[]=[value]
    while(pending.length){const item=pending.pop();if(!item||typeof item!=='object'||seen.has(item))continue;seen.add(item)
      if(Array.isArray(item)){for(const child of item)pending.push(child);continue}
      const record=item as Record<string,unknown>;if(typeof record.role==='string'&&typeof record.id==='string')yield item as Message
      for(const key of ['messages','threads','forks'])if(record[key])pending.push(record[key])
    }
  }
  const scan=async(folders:ReadonlySet<string>)=>{const blocked=new Set<string>();const add=(key:string)=>{if(key){blocked.add(key);blocked.add(key.replace(/:/g,''))}};const metas=await sessions(folders)
    for(const meta of metas){const commit=await rows.readCommit(meta.id)
      if(commit){for await(const reference of iterateRowResourceReferences(rows,meta.id))add(reference.storageKey)}
      else {const value=await readValue('session:'+meta.id);if(!value)throw new Error('Unlock protected projects before browsing the library: a conversation could not be checked');for(const ref of collectHeaderResourceReferences(value as SessionHeader))add(ref.storageKey);for await(const message of legacyMessages(value)){const refs:ResourceReference[]=[];collectMessageReferences(message,meta.id,refs);for(const ref of refs)add(ref.storageKey)}}
    }
    return blocked
  }
  const drafts=async(folders:ReadonlySet<string>)=>{const metas=await sessions(folders);const blocked=new Set<string>();const add=(key:string)=>{if(key){blocked.add(key);blocked.add(key.replace(/:/g,''))}}
    const [{getDefaultStore},{inputBoxPreConstructedMessageFamily}]=await Promise.all([import('jotai'),import('@/stores/atoms/uiAtoms')]);const store=getDefaultStore()
    for(const id of [...metas.map(meta=>meta.id),...Array.from(folders,folder=>'private-new:'+folder)]){const draft=store.get(inputBoxPreConstructedMessageFamily(id));for(const key of draft.pictureKeys)add(key);for(const file of draft.preprocessedFiles){if(file.storageKey)add(file.storageKey);if(file.rawStorageKey)add(file.rawStorageKey)}for(const link of draft.preprocessedLinks)if(link.storageKey)add(link.storageKey);for(const key of Object.keys(draft.preprocessingStatus.files)){add(key);add(key+'_raw')}for(const key of Object.keys(draft.preprocessingStatus.links))add(key)}
    return blocked
  }
  const beforeProtect=async(folder:string,scope:string)=>{
    const [{getDefaultStore},drafts,history]=await Promise.all([import('jotai'),import('@/stores/atoms/uiAtoms'),import('@/hooks/useInputBoxHistory')]);const store=getDefaultStore()
    // Folder drafts have stable identities before and after protection changes.
    const draft=store.get(drafts.inputBoxPreConstructedMessageFamily('private-new:'+folder));await Promise.allSettled([...draft.preprocessingPromises.files.values(),...draft.preprocessingPromises.links.values()])
    const publicHistory=store.get(history.inputBoxHistoryAtom);if(!publicHistory.length)return
    const matches=new Set<string>();const inspect=(message:Message)=>{if(message.role!=='user')return;const text=getMessageText(message);for(const entry of publicHistory)if(text.includes(entry))matches.add(entry)}
    for(const meta of await sessions(new Set([folder]))){const commit=await rows.readCommit(meta.id);if(commit){for await(const row of rows.iterateRows({sessionId:meta.id,expectedRevision:commit.revision}))if(row.kind==='message')inspect(row.message.message)}else for await(const message of legacyMessages(await readValue('session:'+meta.id)))inspect(message)}
    if(matches.size){store.set(history.privateInputBoxHistoryFamily(scope),[...new Set([...matches,...store.get(history.privateInputBoxHistoryFamily(scope))])].slice(0,20));store.set(history.inputBoxHistoryAtom,publicHistory.filter(entry=>!matches.has(entry)))}
  }
  return {scan,drafts,beforeProtect}
}
