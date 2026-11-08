import { expect,it } from 'vitest'
import { defaultLocalMCPPermissions,localMCPAllows,parseSessionResourceURI,sessionResourceURI,LocalMCPStartSchema } from './local-mcp'
it('separates read, permanent write, execution, paid models, Venice and forwarding permissions',()=>{
  const permissions={...defaultLocalMCPPermissions}
  expect(localMCPAllows(permissions,'session_file',{action:'read'})).toBe(true)
  for(const action of ['write','delete','deliver','import'])expect(localMCPAllows(permissions,'session_file',{action})).toBe(false)
  for(const tool of ['session_js','session_python','app_model','venice_image','web_search','mcp_external','run_command'])expect(localMCPAllows(permissions,tool)).toBe(false)
  permissions.writeFiles=true;permissions.execute=true;expect(localMCPAllows(permissions,'session_js')).toBe(true)
  permissions.readFiles=false;expect(localMCPAllows(permissions,'session_js')).toBe(false)
  permissions.forwardMCP=true;expect(localMCPAllows(permissions,'run_command')).toBe(false)
})
it('confines resource URIs to the shared chat and validates start options',()=>{
  const uri=sessionResourceURI('one','image:key/with spaces');expect(parseSessionResourceURI('one',uri)).toBe('image:key/with spaces')
  expect(()=>parseSessionResourceURI('other',uri)).toThrow('shared chat')
  expect(()=>LocalMCPStartSchema.parse({sessionId:'../outside',port:80,permissions:defaultLocalMCPPermissions})).toThrow()
  expect(LocalMCPStartSchema.parse({sessionId:'one',port:0,permissions:defaultLocalMCPPermissions}).port).toBe(0)
})
