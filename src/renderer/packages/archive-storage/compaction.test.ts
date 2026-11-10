import {createRequire} from 'node:module'
import {expect,it,vi} from 'vitest'
import {compactMobileArchiveDatabase} from '@/storage/mobile-archive-compaction'

it('compacts on real SQLite without the Capacitor bridge transaction',async()=>{
  const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite'),db=new DatabaseSync(':memory:')
  try{db.exec('CREATE TABLE archive(value TEXT); INSERT INTO archive VALUES (zeroblob(100000)); DELETE FROM archive;')
    const execute=vi.fn(async(sql:string,transaction=true)=>{if(transaction)db.exec('BEGIN');try{db.exec(sql)}finally{if(transaction)db.exec('ROLLBACK')}})
    expect(db.prepare('PRAGMA freelist_count').get().freelist_count).toBeGreaterThan(0)
    await compactMobileArchiveDatabase({execute})
    expect(db.prepare('PRAGMA freelist_count').get().freelist_count).toBe(0)
    expect(execute).toHaveBeenCalledWith('VACUUM;',false)
    expect(execute).toHaveBeenLastCalledWith('PRAGMA temp_store = DEFAULT;',false)
  }finally{db.close()}
})
it('restores SQLite temporary storage even if compaction runs out of space',async()=>{
  const execute=vi.fn(async(sql:string)=>{if(sql==='VACUUM;')throw Error('Disk full')})
  await expect(compactMobileArchiveDatabase({execute})).rejects.toThrow('Disk full')
  expect(execute).toHaveBeenLastCalledWith('PRAGMA temp_store = DEFAULT;',false)
})

