import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({authorized:false,search:vi.fn(),read:vi.fn()}))
vi.mock('./service',()=>({loadRagSettings:async()=>({}),ragAuthorized:async()=>state.authorized,searchSessionRag:state.search,readSessionRag:state.read}))
import {buildSessionRagTools} from './tools'
beforeEach(()=>{vi.clearAllMocks();state.authorized=false})
it('exposes no RAG tools without this device consent, then scopes search/read to the assigned session',async()=>{
 expect(await buildSessionRagTools('child')).toEqual({});state.authorized=true
 const tools=await buildSessionRagTools('child'),signal=new AbortController().signal,context={toolCallId:'call',messages:[],abortSignal:signal,context:{}}
 await tools.session_rag_search.execute!({query:'budget',limit:3},context);expect(state.search).toHaveBeenCalledWith('child','budget',signal,3)
 const ids=[crypto.randomUUID()];await tools.session_rag_read.execute!({ids},context);expect(state.read).toHaveBeenCalledWith('child',ids,signal)
 expect(tools.session_rag_search.description).toContain('never start paid indexing automatically')
})
