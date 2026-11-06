import { describe, expect, it, vi } from 'vitest'
import { tool } from 'ai'
import { z } from 'zod'
import { guardSearchTools } from './search-policy'
import { setSearchPermission } from './search-permissions'
import { prepareVeniceSearch } from '../venice-search'
import { getVeniceParameters } from '../venice'
import type { ModelDependencies } from '../../../../types/adapters'
const context={toolCallId:'test',messages:[],abortSignal:undefined} as any
const definition=(execute:any)=>tool({inputSchema:z.object({query:z.string()}),execute})
describe('independent Venice search and bounded tool use',()=>{
 it('routes each named engine explicitly without using a chat model',async()=>{
  const api=vi.fn(async()=>Response.json({results:[{title:'Source',url:'https://example.com',content:'Current information'}]}))
  const prepared=await prepareVeniceSearch([{role:'user',content:'Find sources'}],{webSearch:'auto',searchToolMode:'separate'},'key','https://api.venice.ai/api/v1',{request:{apiRequest:api}} as unknown as ModelDependencies,true)
  expect(Object.keys(prepared.tools!)).toEqual(['venice_web_search_brave','venice_web_search_google','venice_web_search_exa'])
  for(const engine of ['brave','google','exa'])await prepared.tools![`venice_web_search_${engine}`].execute!({query:'new information'},context)
  expect(api.mock.calls.map(([request]:any)=>JSON.parse(request.body).search_provider)).toEqual(['brave','google','exa'])
  expect(api.mock.calls.every(([request]:any)=>request.url.endsWith('/augment/search')&&request.retry===0)).toBe(true)
 })
 it('does not offer tools or prefetch when paused, and masks native X/scraping too',async()=>{
  const api=vi.fn();const settings={webSearch:'on' as const,searchToolMode:'separate' as const,webSearchEnabled:false,xSearch:true,webScraping:true}
  expect(await prepareVeniceSearch([{role:'user',content:'private query'}],settings,'key','https://api.venice.ai/api/v1',{request:{apiRequest:api}} as any,true)).toEqual({messages:[{role:'user',content:'private query'}]})
  expect(getVeniceParameters(settings)).toMatchObject({enable_web_search:'off',enable_x_search:false,enable_web_scraping:false})
  expect(api).not.toHaveBeenCalled()
 })
 it('keeps every-message prefetch and then offers all engines when configured',async()=>{
  const api=vi.fn(async()=>Response.json({results:[]}))
  const prepared=await prepareVeniceSearch([{role:'user',content:'current news'}],{webSearch:'on',searchToolMode:'separate'},'key','https://api.venice.ai/api/v1',{request:{apiRequest:api}} as any,true)
  expect(prepared.messages).toHaveLength(2);expect(Object.keys(prepared.tools!)).toHaveLength(3)
  expect(JSON.parse((api.mock.calls[0] as any)[0].body).search_provider).toBe('brave')
 })
 it('shares one budget, reuses repeated queries and removes exhausted search tools',async()=>{
  const execute=vi.fn(async()=>({searchResults:[]}));const guard=guardSearchTools({web_search:definition(execute),venice_web_search_brave:definition(execute),local_echo:definition(execute)})
  const search=guard.tools.web_search.execute!
  await search({query:'  SAME   QUERY '},context);await search({query:'same query'},context)
  expect(execute).toHaveBeenCalledTimes(1);expect(guard.active(['web_search','local_echo'])).toEqual(['local_echo'])
  for(let index=0;index<12;index++)await guard.tools.venice_web_search_brave.execute!({query:String(index)},context)
  expect(execute).toHaveBeenCalledTimes(6);expect(guard.active(Object.keys(guard.tools))).toEqual(['local_echo'])
 })
 it('stops offering a failed tool without replaying its request',async()=>{
  const execute=vi.fn(async()=>{throw new Error('HTTP 429')});const guard=guardSearchTools({web_search:definition(execute)})
  await expect(guard.tools.web_search.execute!({query:'query'},context)).rejects.toThrow('Do not retry')
  expect(guard.active(['web_search'])).toEqual([])
  await expect(guard.tools.web_search.execute!({query:'query'},context)).rejects.toThrow('HTTP 429')
  expect(execute).toHaveBeenCalledTimes(1)
 })
 it('revokes only the selected search path while a reply is running',async()=>{
  const execute=vi.fn(async()=>({searchResults:[]})),session='live-revocation-test'
  const guard=guardSearchTools({web_search:definition(execute),venice_web_search_google:definition(execute)},session)
  setSearchPermission(session,'global',false)
  await guard.tools.web_search.execute!({query:'private'},context)
  await guard.tools.venice_web_search_google.execute!({query:'allowed'},context)
  expect(execute).toHaveBeenCalledTimes(1);expect(guard.active(Object.keys(guard.tools))).toEqual(['venice_web_search_google'])
  setSearchPermission(session,'venice',false)
  expect(guard.active(Object.keys(guard.tools))).toEqual([])
 })
})
