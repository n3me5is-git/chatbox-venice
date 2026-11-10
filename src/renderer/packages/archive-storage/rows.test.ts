import {describe,expect,it} from 'vitest'
import {InMemorySessionRowStore} from '../../../../packages/chatbox-core/src/persistence/memory-session-row-store'
import {createSessionRowStoreContract} from '../../../../packages/chatbox-core/src/ports/testing/session-row-store-contract'
import {archiveFixture} from './fixtures.test-support'
import {ArchiveRows} from './rows'
describe('archive row port retains row-store behavior',()=>{
 for(const contract of createSessionRowStoreContract(async()=>{const {engine,catalog}=archiveFixture();await catalog.setState({root:'internal',enabled:true});const rows=new ArchiveRows(new InMemorySessionRowStore(),engine,work=>work());return rows.port()}))it(contract.name,contract.run)
 it('uses local lightweight stubs while keeping arbitrary tool payloads encrypted',async()=>{const f=archiveFixture();await f.catalog.setState({root:'internal',enabled:true});const rows=new ArchiveRows(new InMemorySessionRowStore(),f.engine,work=>work());const message={id:'m',role:'assistant',contentParts:[{type:'tool-call',toolCallId:'call',toolName:'enterprise_mcp',state:'result',args:{sensitive:'company data'},result:{private:'document'}}]};const stored=await rows.message({sessionId:'s',threadId:'t',messageId:'m',parentMessageId:null,activeChildId:null,siblingOrder:0,kind:'message',status:'settled',createdAt:1,updatedAt:1,branchId:null,message} as any);expect(JSON.stringify(stored)).not.toContain('company data');expect((await rows.hydrate(stored)).message).toEqual(message);expect(stored.facts?.hasToolCall).toBe(true)})
})
