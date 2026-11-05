import { describe,expect,it } from 'vitest'
import type { SessionMetaRepositoryPort,SessionRowStorePort } from '@chatbox/core/ports'
import { projectLibrary } from './project-library'
describe('project library reference ownership',()=>{
 it('scans legacy messages, inactive threads and sanitized attachment aliases without opening binary files',async()=>{
  const metadata={initialize:async()=>{},getAllIncludingHidden:async()=>[{id:'private',folderId:'locked'},{id:'ordinary',folderId:'public'}]} as unknown as SessionMetaRepositoryPort
  const rows={readCommit:async()=>null} as unknown as SessionRowStorePort
  const library=projectLibrary(metadata,rows,async key=>{expect(key).toBe('session:private');return {id:'private',assistantAvatarKey:'picture:avatar',messages:[{id:'one',role:'user',contentParts:[{type:'image',storageKey:'picture:private'}]}],threads:[{messages:[{id:'old',role:'user',files:[{storageKey:'file:private',rawStorageKey:'file:private_raw'}]}]}]}})
  const keys=await library.scan(new Set(['locked']));expect([...keys]).toEqual(expect.arrayContaining(['picture:avatar','picture:private','pictureprivate','file:private','file:private_raw']));expect(keys.has('ordinary')).toBe(false)
 })
 it('fails closed when a legacy protected conversation cannot be examined',async()=>{const metadata={initialize:async()=>{},getAllIncludingHidden:async()=>[{id:'missing',folderId:'locked'}]} as unknown as SessionMetaRepositoryPort;const rows={readCommit:async()=>null} as unknown as SessionRowStorePort;await expect(projectLibrary(metadata,rows,async()=>null).scan(new Set(['locked']))).rejects.toThrow('could not be checked')})
})
