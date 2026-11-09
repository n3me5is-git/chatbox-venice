import { expect,it } from 'vitest'
import { createMessage,MessageSchema } from '@shared/types'
import { SnapshotSchema } from '@shared/collaboration'
import { sharedMessage,boundSharedSnapshot } from './projection'
it('keeps the verified author after message persistence and in host/guest projections',()=>{
  const message={...createMessage('user','From Alice'),collaborationAuthor:{id:'authenticated-device',name:'Alice'}}
  const saved=MessageSchema.parse(JSON.parse(JSON.stringify(message))),copy=sharedMessage('row',saved,['file','file'],false)
  expect(saved.collaborationAuthor).toEqual(message.collaborationAuthor);expect(copy.author).toEqual(message.collaborationAuthor);expect(copy.files).toEqual(['file'])
  expect(sharedMessage('owner',createMessage('user','Owner prompt'),[],false).author).toEqual({id:'owner',name:'Owner'})
})
it('shows live text, tool progress, errors and visible reasoning without copying image bytes or replay metadata',()=>{
  const message=createMessage('assistant','Live text');message.generating=true;message.error='Provider failed';message.contentParts.push({type:'reasoning',text:'Visible thinking'},{type:'reasoning',text:'Hidden signature',protocolOnly:true},{type:'image',storageKey:'private-local-blob'},{type:'tool-call',toolCallId:'call',toolName:'mcp_read',state:'result',args:{id:1},result:{ok:true},providerMetadata:{openai:{itemId:'private-replay-id'}}})
  const copy=sharedMessage('row',message,['public-file-id'],false)
  expect(copy).toMatchObject({text:'Live text',generating:true,error:'Provider failed',reasoning:'Visible thinking',tools:[{name:'mcp_read',state:'completed'}]})
  expect(JSON.stringify(copy)).not.toMatch(/private-local-blob|private-replay-id|Hidden signature/)
  expect(SnapshotSchema.safeParse({title:'Test',messages:[copy],files:[],truncated:false,revision:1}).success).toBe(true)
})
it('bounds history including tool details and keeps the newest messages',()=>{
  const rows=Array.from({length:50},(_,index)=>({id:String(index),role:'assistant' as const,text:'x'.repeat(190000)})),snapshot=boundSharedSnapshot({title:'Large',messages:rows,files:[],truncated:false,revision:1})
  expect(JSON.stringify(snapshot).length).toBeLessThan(6000000);expect(snapshot.truncated).toBe(true);expect(snapshot.messages.at(-1)?.id).toBe('49')
})
