import 'fake-indexeddb/auto'
import {IDBFactory} from 'fake-indexeddb'
import {beforeEach,describe,it} from 'vitest'
import {IndexedDBSessionRowStore} from '@/storage/SessionRowStorage'
import {createSessionRowStoreContract} from '@chatbox/core/ports/testing/session-row-store-contract'
import {archiveFixture} from './fixtures.test-support'
import {ArchiveRows} from './rows'
beforeEach(()=>{globalThis.indexedDB=new IDBFactory()})
describe('archived desktop IndexedDB conversation contract',()=>{for(const test of createSessionRowStoreContract(async()=>{const f=archiveFixture();await f.catalog.setState({root:'internal',enabled:true});return new ArchiveRows(new IndexedDBSessionRowStore(),f.engine,work=>work()).port()}))it(test.name,test.run)})
