import { expect,it } from 'vitest'
import { redactLocalMCPResult } from './local-mcp-redaction'
it('removes configured provider, OAuth, MCP header and query credentials from outbound errors and descriptions',()=>{
  const settings={providers:{venice:{apiKey:'SENSITIVE-VENICE-KEY'},oauth:{accessToken:'OAUTH-TOKEN-123',refreshToken:'REFRESH-TOKEN-456'}},mcp:{transport:{headers:{Authorization:'Bearer local-access-token'},url:'https://service.example/mcp?token=query-secret-token'}}}
  const output={error:'SENSITIVE-VENICE-KEY OAUTH-TOKEN-123 REFRESH-TOKEN-456 Bearer local-access-token query-secret-token',message:'normal text',description:'Tool uses SENSITIVE-VENICE-KEY'}
  expect(redactLocalMCPResult(output,settings)).toEqual({error:'[redacted] [redacted] [redacted] [redacted] [redacted]',message:'normal text',description:'Tool uses [redacted]'})
  expect(output.error).toContain('SENSITIVE-VENICE-KEY')
})
