interface SQLiteExecutor {
  execute(statements:string,transaction?:boolean):Promise<unknown>
}

/** VACUUM cannot run in the Capacitor bridge's default transaction. Keep its temporary copy on disk. */
export async function compactMobileArchiveDatabase(database:SQLiteExecutor):Promise<void>{
  await database.execute('PRAGMA secure_delete = ON;',false)
  await database.execute('PRAGMA temp_store = FILE;',false)
  try{await database.execute('VACUUM;',false)}finally{await database.execute('PRAGMA temp_store = DEFAULT;',false)}
}

