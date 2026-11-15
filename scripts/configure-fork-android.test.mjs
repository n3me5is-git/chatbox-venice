import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..')
test('generated Android manifest declares every audio permission Capacitor requests, idempotently',()=>{
  const temporary=resolve(tmpdir()),root=mkdtempSync(join(temporary,'chatbox-audio-manifest-'))
  try{
    for(const directory of ['android/app/src/main/java/io/github/n3me5is/chatboxvenice','release/app','native/android','src/shared'])mkdirSync(join(root,directory),{recursive:true})
    writeFileSync(join(root,'src/shared/paddle-ocr-artifacts.json'),JSON.stringify({version:1,models:null,android:null}))
    writeFileSync(join(root,'release/app/package.json'),JSON.stringify({version:'1.34.1'}))
    writeFileSync(join(root,'android/app/build.gradle'),'versionCode 1\nversionName "1.0.0"')
    writeFileSync(join(root,'android/app/src/main/AndroidManifest.xml'),'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application></application></manifest>')
    for(const file of ['DocumentSaverPlugin.java','SessionFolderPlugin.java','ArchiveStoragePlugin.java','VaultKeyPlugin.java','SharingBackgroundPlugin.java','SharingBackgroundService.java','PaddleOCRPlugin.java'])copyFileSync(join(repository,'native/android',file),join(root,'native/android',file))
    const script=join(repository,'scripts/configure-fork-android.mjs')
    execFileSync(process.execPath,[script],{cwd:root})
    assert.match(readFileSync(join(root,'android/app/src/main/java/io/github/n3me5is/chatboxvenice/MainActivity.java'),'utf8'),/registerPlugin\(PaddleOCRPlugin.class\)/)
    assert.equal(JSON.parse(readFileSync(join(root,'android/app/src/main/assets/paddle-ocr-artifacts.json'),'utf8')).version,1)
    const manifest=join(root,'android/app/src/main/AndroidManifest.xml')
    for(const name of ['RECORD_AUDIO','MODIFY_AUDIO_SETTINGS'])assert.ok(readFileSync(manifest,'utf8').includes('android.permission.'+name))
    for(const name of ['WAKE_LOCK','POST_NOTIFICATIONS','FOREGROUND_SERVICE','FOREGROUND_SERVICE_REMOTE_MESSAGING'])assert.ok(readFileSync(manifest,'utf8').includes('android.permission.'+name))
    assert.ok(readFileSync(manifest,'utf8').includes('android:foregroundServiceType="remoteMessaging"'))
    assert.ok(readFileSync(manifest,'utf8').includes('android.permission.CAMERA'))
    assert.ok(readFileSync(manifest,'utf8').includes('android:name="android.hardware.camera" android:required="false"'))
    execFileSync(process.execPath,[script],{cwd:root})
    for(const name of ['RECORD_AUDIO','MODIFY_AUDIO_SETTINGS'])assert.equal(readFileSync(manifest,'utf8').split('android.permission.'+name).length-1,1)
  }finally{
    assert.equal(dirname(root),temporary);assert.ok(basename(root).startsWith('chatbox-audio-manifest-'))
    rmSync(root,{recursive:true,force:true})
  }
})
