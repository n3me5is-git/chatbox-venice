import {settingsStore} from '@/stores/settingsStore'
import {SystemProviders} from '@shared/defaults'
import {apiRequest} from '@/utils/request'
/** Standard Cohere/Jina compatible rerank API; no silent remote fallback. */
export async function rerankCollection(query:string,documents:string[],provider:string,model:string,signal:AbortSignal){
 const global=settingsStore.getState().getSettings(),saved=global.providers?.[provider],definition=[...SystemProviders(),...global.customProviders||[]].find(item=>item.id===provider),host=(saved?.apiHost||definition?.defaultSettings?.apiHost||'').replace(/\/$/,'')
 if(!saved?.apiKey||!host)throw Error('Configure the selected rerank provider first')
 const dash=/dashscope\.(?:aliyuncs|intl\.aliyuncs)\.com/i.test(host),url=dash?new URL('/api/v1/services/rerank/text-rerank',host).href:host.replace(/\/v[12]$/,'')+'/v2/rerank'
 const body=dash?{model,input:{query,documents},parameters:{top_n:5,return_documents:false}}:{model,query,documents,top_n:5}
 const response=await apiRequest.post(url,{Authorization:'Bearer '+saved.apiKey,'Content-Type':'application/json'},JSON.stringify(body),{signal,retry:0}),result=await response.json(),items=dash?result.output?.results:result.results
 if(!Array.isArray(items)||items.length>documents.length)throw Error('Invalid rerank response')
 const seen=new Set<number>();return items.map(item=>{const score=item.relevance_score??item.relevanceScore;if(!Number.isInteger(item.index)||item.index<0||item.index>=documents.length||seen.has(item.index)||!Number.isFinite(score))throw Error('Invalid rerank response');seen.add(item.index);return {index:item.index,score}})
}
