import { expect,it } from 'vitest'
import { defaultLocalMCPPermissions,localMCPAllows,localMCPWorkerAllows,parseSessionResourceURI,sessionResourceURI,LocalMCPStartSchema,localMCPGrantAllows,LocalMCPApplicationSchema,localMCPClientConfiguration } from './local-mcp'
it('separates read, permanent write, execution, paid models, Venice and forwarding permissions',()=>{
  const permissions={...defaultLocalMCPPermissions}
  expect(localMCPAllows(permissions,'session_file',{action:'read'})).toBe(true)
  for(const action of ['write','delete','deliver','import'])expect(localMCPAllows(permissions,'session_file',{action})).toBe(false)
  for(const tool of ['session_js','session_python','app_model','venice_image','web_search','web_search_brave','web_search_google','web_search_exa','mcp_external','run_command'])expect(localMCPAllows(permissions,tool)).toBe(false)
  permissions.search=true;for(const tool of ['web_search','web_search_brave','web_search_google','web_search_exa'])expect(localMCPAllows(permissions,tool)).toBe(true)
  expect(localMCPAllows(permissions,'web_search_untrusted')).toBe(false)
  expect(localMCPAllows(permissions,'agent_spawn')).toBe(false)
  permissions.multiAgent=true
  expect(localMCPAllows(permissions,'agent_spawn')).toBe(true)
  expect(localMCPAllows(permissions,'agent_tree')).toBe(true)
  expect(localMCPAllows(permissions,'agent_untrusted')).toBe(false)
  expect(localMCPAllows(permissions,'agent_file')).toBe(false)
  permissions.writeFiles=true;permissions.execute=true;expect(localMCPAllows(permissions,'session_js')).toBe(true)
  permissions.readFiles=false;expect(localMCPAllows(permissions,'session_js')).toBe(false)
  permissions.forwardMCP=true;expect(localMCPAllows(permissions,'run_command')).toBe(false)
})
it('keeps granular file and service permissions in nested workers without allowing forwarding to bypass agent restrictions',()=>{
  const permissions={...defaultLocalMCPPermissions,multiAgent:true,forwardMCP:true},available=new Set(['session_file','mcp_external'])
  expect(localMCPWorkerAllows(permissions,available,'session_file',{action:'read'})).toBe(true)
  expect(localMCPWorkerAllows(permissions,available,'session_file',{action:'preview'})).toBe(true)
  expect(localMCPWorkerAllows(permissions,available,'session_file',{action:'write'})).toBe(false)
  expect(localMCPWorkerAllows(permissions,available,'agent_file')).toBe(false)
  expect(localMCPWorkerAllows(permissions,available,'agent_spawn')).toBe(true)
  expect(localMCPWorkerAllows(permissions,available,'agent_bypass')).toBe(false)
  expect(localMCPWorkerAllows(permissions,available,'external')).toBe(true)
  expect(localMCPWorkerAllows(permissions,available,'unexposed')).toBe(false)
  expect(localMCPWorkerAllows(permissions,available,'venice_image')).toBe(false)
  expect(localMCPWorkerAllows(permissions,available,'web_search')).toBe(false)
  expect(localMCPWorkerAllows(permissions,available,'session_js')).toBe(false)
  permissions.multiAgent=false;expect(localMCPWorkerAllows(permissions,available,'agent_spawn')).toBe(false)
})
it('confines resource URIs to the shared chat and validates start options',()=>{
  const uri=sessionResourceURI('one','image:key/with spaces');expect(parseSessionResourceURI('one',uri)).toBe('image:key/with spaces')
  expect(()=>parseSessionResourceURI('other',uri)).toThrow('shared chat')
  expect(()=>LocalMCPStartSchema.parse({sessionId:'../outside',port:80,permissions:defaultLocalMCPPermissions})).toThrow()
  expect(LocalMCPStartSchema.parse({sessionId:'one',port:0,permissions:defaultLocalMCPPermissions}).port).toBe(0)
})

it('keeps router, shadow and full app scopes separate from their feature flags',()=>{
  const grant={running:true as const,sessionId:'application',url:'http://127.0.0.1:1/mcp',token:'test',startedAt:1,permissions:{...defaultLocalMCPPermissions,models:true},application:LocalMCPApplicationSchema.parse({mode:'router',name:'Models'})}
  expect(localMCPGrantAllows(grant,'app_model')).toBe(true);expect(localMCPGrantAllows(grant,'app_resources')).toBe(true)
  for(const name of ['app_contexts','app_conversation','app_call','session_file','web_search','agent_spawn','venice_studio'])expect(localMCPGrantAllows(grant,name)).toBe(false)
  grant.application.mode='shadow';expect(localMCPGrantAllows(grant,'app_contexts')).toBe(true);expect(localMCPGrantAllows(grant,'app_model')).toBe(false)
})

it('copies distinct portable client names for same-name endpoints without exporting grant metadata',()=>{
 const base={running:true as const,sessionId:'application',url:'http://127.0.0.1:3000/mcp',token:'private-local-token',startedAt:1,permissions:defaultLocalMCPPermissions,application:LocalMCPApplicationSchema.parse({mode:'router',name:'Local agent è'})}
 const first=localMCPClientConfiguration(base),second=localMCPClientConfiguration({...base,url:'http://127.0.0.1:3001/mcp'})
 const a=Object.keys(first.mcpServers)[0],b=Object.keys(second.mcpServers)[0];expect(a).toMatch(/^[a-z0-9_-]+$/);expect(a).not.toBe(b)
 expect(Object.values(first.mcpServers)[0]).toEqual({url:base.url,headers:{Authorization:'Bearer private-local-token'}});expect(JSON.stringify(first)).not.toContain('permissions')
})

it('grants knowledge tools independently, only for selected app collections and never in model-only router mode',async()=>{
 const {localMCPGrantAllows,LocalMCPApplicationSchema}=await import('./local-mcp'),grant={running:true as const,sessionId:'application',url:'http://localhost',token:'x',startedAt:1,permissions:{...defaultLocalMCPPermissions,knowledge:true},application:LocalMCPApplicationSchema.parse({mode:'full',name:'KB',knowledgeCollectionIds:[-1]})}
 expect(localMCPGrantAllows(grant,'knowledge_base')).toBe(true);expect(localMCPGrantAllows(grant,'knowledge_sources_1')).toBe(true);expect(localMCPGrantAllows(grant,'knowledge_delete')).toBe(false);grant.application.mode='router';expect(localMCPGrantAllows(grant,'knowledge_base')).toBe(false);grant.application.mode='full';grant.application.knowledgeCollectionIds=[];expect(localMCPGrantAllows(grant,'knowledge_base')).toBe(false)
})
