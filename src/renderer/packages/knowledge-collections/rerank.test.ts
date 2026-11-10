import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({post:vi.fn(),settings:{providers:{rank:{apiKey:'test',apiHost:'https://rank.example/v1'},dash:{apiKey:'test',apiHost:'https://dashscope.aliyuncs.com/compatible-mode/v1'}},customProviders:[]} as any}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.settings})}}));vi.mock('@/utils/request',()=>({apiRequest:{post:state.post}}))
import {rerankCollection} from './rerank'
beforeEach(()=>vi.clearAllMocks())
it('uses selected Cohere-compatible reranking without implicit retries and keeps passage identities',async()=>{
 state.post.mockResolvedValue({json:async()=>({results:[{index:1,relevance_score:0.9},{index:0,relevance_score:0.2}]})});const signal=new AbortController().signal
 expect(await rerankCollection('query',['first','second'],'rank','ranker',signal)).toEqual([{index:1,score:0.9},{index:0,score:0.2}]);expect(state.post).toHaveBeenCalledWith('https://rank.example/v2/rerank',expect.anything(),JSON.stringify({model:'ranker',query:'query',documents:['first','second'],top_n:5}),{signal,retry:0})
})
it('uses DashScope format and rejects invalid passage indices',async()=>{
 state.post.mockResolvedValue({json:async()=>({output:{results:[{index:0,relevance_score:0.7}]}})});await rerankCollection('query',['first'],'dash','ranker',new AbortController().signal);expect(state.post.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank')
 state.post.mockResolvedValue({json:async()=>({results:[{index:9,relevance_score:0.4}]})});await expect(rerankCollection('query',['first'],'rank','ranker',new AbortController().signal)).rejects.toThrow('Invalid')
})
