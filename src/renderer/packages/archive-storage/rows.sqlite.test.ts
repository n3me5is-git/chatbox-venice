import {afterEach,describe,it} from 'vitest'
import {SqlSessionRowStore} from '../../../../packages/chatbox-core/src/persistence/session-row-sql'
import {openNodeSessionRowDatabase,type NodeSessionRowSqlDatabase} from '../../../../packages/chatbox-core/src/persistence/node-sqlite.test-support'
import {createSessionRowStoreContract} from '@chatbox/core/ports/testing/session-row-store-contract'
import {archiveFixture} from './fixtures.test-support'
import {ArchiveRows} from './rows'
const databases:NodeSessionRowSqlDatabase[]=[]
afterEach(()=>{for(const db of databases.splice(0))db.close()})
describe('archived native SQL conversation contract',()=>{for(const test of createSessionRowStoreContract(async()=>{const f=archiveFixture();await f.catalog.setState({root:'internal',enabled:true});const db=openNodeSessionRowDatabase();databases.push(db);return new ArchiveRows(new SqlSessionRowStore(db),f.engine,work=>work()).port()}))it(test.name,test.run)})
