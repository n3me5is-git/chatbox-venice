import {expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({settings:{} as any}))
vi.mock('@/stores/settingsStore',()=>({settingsStore:{getState:()=>({getSettings:()=>state.settings})}}))
vi.mock('@/components/ModelSelectorV2',()=>({ModelSelectorV2:()=>null}))
import {globalCollectionReranker} from './CollectionReranking'
it('keeps reranking disabled when no global role model is configured',()=>{state.settings={};expect(globalCollectionReranker()).toEqual({mode:'api',provider:'',model:''})})
it('imports explicit API or virtual defaults and prefers API when both exist',()=>{
 const api={provider:'local',model:'reranker'},llm={provider:'private',model:'judge'};state.settings={defaultVirtualRerankModel:llm};expect(globalCollectionReranker()).toEqual({mode:'llm',...llm});state.settings.defaultRerankModel=api;expect(globalCollectionReranker()).toEqual({mode:'api',...api})
})
