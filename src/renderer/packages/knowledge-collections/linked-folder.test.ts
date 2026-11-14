import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({data:vi.fn(),assert:vi.fn(),syncFolder:vi.fn(),index:vi.fn(),operation:vi.fn()}))
vi.mock('./service',()=>({knowledgeCollections:state}))
vi.mock('@/packages/session-resources/linked-folder',()=>({linkedFolderAvailable:()=>true,linkedFolderOperation:(...args:any[])=>state.operation(...args)}))
import {refreshCollectionFolder} from './linked-folder'
beforeEach(()=>{vi.clearAllMocks();state.data.mockResolvedValue({folder:{bindingId:'b'},settings:{exclude:[]}});state.operation.mockImplementation(async input=>input.action==='list'?{linked:true,bindingId:'b',files:[]}:{linked:true,bindingId:'b'});state.syncFolder.mockResolvedValue({added:0,changed:0,removed:0,unchanged:0})})
it('does not interpret a missing, revoked or incomplete folder as document deletions',async()=>{
 state.operation.mockResolvedValueOnce({linked:false});await expect(refreshCollectionFolder(-1)).rejects.toThrow('unavailable');expect(state.syncFolder).not.toHaveBeenCalled()
 state.operation.mockImplementation(async input=>input.action==='list'?{linked:true,bindingId:'b',files:[],truncated:true}:{linked:true,bindingId:'b'});await expect(refreshCollectionFolder(-1)).rejects.toThrow('incomplete');expect(state.syncFolder).not.toHaveBeenCalled();expect(state.index).not.toHaveBeenCalled()
})
it('checks binding and content version before ingesting bytes, and never sends a native write',async()=>{
 const bytes=btoa('Source');state.operation.mockImplementation(async input=>input.action==='list'?{linked:true,bindingId:'b',files:[{path:'document.md',bytes:6,version:'a'.repeat(64)}]}:input.action==='read'?{linked:true,bindingId:'b',version:'c'.repeat(64),base64:bytes}:{linked:true,bindingId:'b'});state.syncFolder.mockImplementationOnce(async(_id,_binding,rows,port)=>{expect(rows).toHaveLength(1);await port.read(rows[0].path,rows[0].version)});await expect(refreshCollectionFolder(-1)).rejects.toThrow('changed during refresh');expect(state.operation.mock.calls.every(([input])=>['list','status','read'].includes(input.action))).toBe(true)
})
