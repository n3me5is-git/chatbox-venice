import { beforeEach, expect, it, vi } from 'vitest'
import { rowChatFixture } from '../../../../packages/chatbox-core/src/application/chat/testing/row-chat-fixture'
import type { Message, Session } from '@shared/types'
import { sessionFilePath } from '@shared/session-resources'
import { SessionRowConflictError } from '@chatbox/core/ports'

const state=vi.hoisted(()=>({rows:undefined as any,index:{files:[],removed:[],version:1} as any,locked:false,images:[] as any[],media:[] as any[],blob:vi.fn(),remove:vi.fn(),deleteImage:vi.fn(),assert:vi.fn()}))
vi.mock('@/platform',()=>({default:{type:'desktop',getSessionRowStore:()=>state.rows,getImageGenerationStorage:()=>({initialize:async()=>{},getPage:async()=>({items:state.images,nextCursor:null})}),sessionDiskFiles:async()=>({success:true,files:[]})}}))
vi.mock('@/packages/vault/runtime',()=>({vaultRuntimeFor:()=>({projects:{assertSession:state.assert},assets:{header:async()=>null}})}))
vi.mock('@/packages/venice/service',()=>({veniceMediaService:{list:async()=>state.media,remove:vi.fn()}}))
vi.mock('@/packages/mobile-work-mode/CapacitorWorkspace',()=>({CapacitorWorkspace:class {}}))
vi.mock('@/adapters/CurrentBlobStorage',()=>({currentBlobStorage:{get:state.blob,remove:state.remove}}))
vi.mock('@/stores/imageGenerationActions',()=>({getImageGenerationService:()=>({deleteOutput:state.deleteImage})}))
vi.mock('./files',()=>({sessionFiles:{index:async()=>state.index,remove:async(_id:string,id:string,aliases:string[]=[])=>{state.index.removed.push(id,...aliases)}},resourcesChanged:vi.fn()}))
import { listSessionResources,readSessionResource,removeSessionResource } from './service'

const message=(id:string,contentParts:Message['contentParts']=[]):Message=>({id,role:'assistant',contentParts})
async function prepare(session:Session){const fixture=rowChatFixture(()=>'',session);await fixture.prepare(session.id);state.rows=fixture.rows;return fixture.rows}
beforeEach(()=>{
  vi.clearAllMocks();state.index={version:1,files:[],removed:[]};state.images=[];state.media=[];state.locked=false
  state.assert.mockImplementation(async()=>{if(state.locked)throw Error('Locked project')})
})
it('finds resources beyond the first message/thread pages and in unselected branches without reading media bytes',async()=>{
  const initial=Array.from({length:65},(_,n)=>message('message-'+n,n===64?[{type:'image',storageKey:'picture:late'}]:[]))
  initial[0]=message('pivot')
  const session:Session={id:'chat',name:'Chat',messages:initial,messageForksHash:{pivot:{position:0,createdAt:1,lists:[{id:'active',messages:[]},{id:'other',messages:[message('branch-image',[{type:'image',storageKey:'picture:branch'}])]}]}},threads:Array.from({length:32},(_,n)=>({id:'history-'+n,name:'History',createdAt:n+1,messages:[message('history-message-'+n,n===31?[{type:'image',storageKey:'picture:history'}]:[])]}))}
  const rows=await prepare(session),reads=vi.spyOn(rows,'readMessages'),relations=vi.spyOn(rows,'readMessageRelationsPage')
  const result=await listSessionResources('chat')
  expect(result.items.map(item=>item.key).sort()).toEqual(['picture:branch','picture:history','picture:late'])
  for(const item of result.items)expect(sessionFilePath(item.path)).toBe(item.path)
  expect(reads.mock.calls.every(([request])=>request.messageIds.length<=30)).toBe(true)
  expect(relations.mock.calls.length).toBeGreaterThan(33)
  expect(state.blob).not.toHaveBeenCalled();expect(result.truncated).toBe(false)
})
it('prefers the canonical generated image and tombstones all alternate chat references after deleting it',async()=>{
  await prepare({id:'chat',name:'Chat',messages:[message('image',[{type:'image',storageKey:'picture:generated'}])]})
  state.images=[{id:'generation',source:{sessionId:'chat'},generatedImages:['picture:generated','picture:sibling']},{id:'unrelated',source:{sessionId:'another'},generatedImages:['picture:other']}]
  const result=await listSessionResources('chat');expect(result.items).toHaveLength(2)
  const image=result.items.find(item=>item.key==='picture:generated')!;expect(image.origin).toBe('image')
  await removeSessionResource('chat',image)
  expect(state.deleteImage).toHaveBeenCalledWith('generation','picture:generated')
  expect((await listSessionResources('chat')).items.map(item=>item.key)).toEqual(['picture:sibling'])
  await expect(readSessionResource('chat',{...image,origin:'attachment',id:'blob:picture:generated'})).rejects.toThrow('deleted')
})
it('retries an interleaving row revision instead of hiding the explorer',async()=>{
  const rows=await prepare({id:'chat',name:'Chat',messages:[message('one',[{type:'image',storageKey:'picture:saved'}])]})
  const read=rows.readMessages.bind(rows)
  const calls=vi.spyOn(rows,'readMessages').mockRejectedValueOnce(new SessionRowConflictError('chat',1,2)).mockImplementation(read)
  expect((await listSessionResources('chat')).items.map(item=>item.key)).toContain('picture:saved')
  expect(calls).toHaveBeenCalledTimes(2)
})
it('keeps durable files and generated images available while the transcript changes continuously',async()=>{
  const rows=await prepare({id:'chat',name:'Chat',messages:[message('streaming')]})
  vi.spyOn(rows,'readMessageRelationsPage').mockRejectedValue(new SessionRowConflictError('chat',1,2))
  state.index.files=[{id:'local',origin:'file',path:'notes.md',name:'notes.md',mime:'text/markdown',key:'session-file:local'}]
  state.images=[{id:'generation',source:{sessionId:'chat'},generatedImages:['picture:safe']}]
  const result=await listSessionResources('chat')
  expect(result.items.map(item=>item.key).sort()).toEqual(['picture:safe','session-file:local']);expect(result.truncated).toBe(true)
})
it('decodes existing raw base64 image blobs as image bytes for local previews and exports',async()=>{
  state.blob.mockResolvedValueOnce('AAECAw==')
  const {bytes}=await readSessionResource('chat',{id:'old',origin:'image',path:'images/old.png',name:'old.png',mime:'image/png',key:'picture:legacy'})
  expect([...bytes]).toEqual([0,1,2,3])
})
it('rejects protected/aborted sessions before reading payloads and rechecks access before publishing a list',async()=>{
  const rows=await prepare({id:'chat',name:'Chat',messages:[]})
  state.locked=true;await expect(listSessionResources('chat')).rejects.toThrow('Locked');expect(state.blob).not.toHaveBeenCalled()
  state.locked=false;const controller=new AbortController();controller.abort();await expect(listSessionResources('chat',controller.signal)).rejects.toThrow()
  vi.spyOn(rows,'readThreadSummariesPage').mockImplementationOnce(async()=>{state.locked=true;return null})
  await expect(listSessionResources('chat')).rejects.toThrow('Locked')
})
