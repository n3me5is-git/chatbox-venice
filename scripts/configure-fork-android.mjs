import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'

const manifest = 'android/app/src/main/AndroidManifest.xml'
let xml = readFileSync(manifest, 'utf8')
// Capacitor's AUDIO_CAPTURE permission callback requires both permissions. An
// undeclared MODIFY_AUDIO_SETTINGS makes the whole callback deny microphone use.
for (const permission of ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA', 'USE_BIOMETRIC', 'USE_FINGERPRINT', 'WAKE_LOCK', 'POST_NOTIFICATIONS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_REMOTE_MESSAGING', 'FOREGROUND_SERVICE_DATA_SYNC']) {
  if (!xml.includes(`android.permission.${permission}`)) xml = xml.replace('<application', `<uses-permission android:name="android.permission.${permission}" /><application`)
}
// QR scanning stays optional on camera-less devices.
if (!xml.includes('android.hardware.camera')) xml = xml.replace('<application', '<uses-feature android:name="android.hardware.camera" android:required="false" /><application')
if (!xml.includes('android:usesCleartextTraffic=')) xml = xml.replace('<application', '<application android:usesCleartextTraffic="false"')
writeFileSync(manifest, xml)
if (!xml.includes('SharingBackgroundService')) { xml = xml.replace('</application>', '<service android:name=".SharingBackgroundService" android:exported="false" android:stopWithTask="true" android:foregroundServiceType="remoteMessaging" /></application>'); writeFileSync(manifest, xml) }
if (!xml.includes('KnowledgeIndexingBackgroundService')) { xml = xml.replace('</application>', '<service android:name=".KnowledgeIndexingBackgroundService" android:exported="false" android:stopWithTask="true" android:foregroundServiceType="dataSync" /></application>'); writeFileSync(manifest, xml) }
const version = JSON.parse(readFileSync('release/app/package.json', 'utf8')).version
const gradle = 'android/app/build.gradle'
writeFileSync(gradle, readFileSync(gradle, 'utf8')
  .replace(/versionCode\s+\d+/, `versionCode ${1000000 + Number(process.env.GITHUB_RUN_NUMBER || 1)}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`))
const javaDir = 'android/app/src/main/java/io/github/n3me5is/chatboxvenice'
copyFileSync('native/android/DocumentSaverPlugin.java', `${javaDir}/DocumentSaverPlugin.java`)
copyFileSync('native/android/SessionFolderPlugin.java', `${javaDir}/SessionFolderPlugin.java`)
copyFileSync('native/android/ArchiveStoragePlugin.java', `${javaDir}/ArchiveStoragePlugin.java`)
copyFileSync('native/android/VaultKeyPlugin.java', `${javaDir}/VaultKeyPlugin.java`)
copyFileSync('native/android/SharingBackgroundPlugin.java', `${javaDir}/SharingBackgroundPlugin.java`)
copyFileSync('native/android/KnowledgeIndexingBackgroundPlugin.java', `${javaDir}/KnowledgeIndexingBackgroundPlugin.java`)
copyFileSync('native/android/KnowledgeIndexingBackgroundService.java', `${javaDir}/KnowledgeIndexingBackgroundService.java`)
copyFileSync('native/android/SharingBackgroundService.java', `${javaDir}/SharingBackgroundService.java`)
copyFileSync('native/android/PaddleOCRPlugin.java', `${javaDir}/PaddleOCRPlugin.java`)
mkdirSync('android/app/src/main/assets',{recursive:true})
copyFileSync('src/shared/paddle-ocr-artifacts.json','android/app/src/main/assets/paddle-ocr-artifacts.json')
writeFileSync(`${javaDir}/MainActivity.java`, `package io.github.n3me5is.chatboxvenice;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DocumentSaverPlugin.class);
    registerPlugin(VaultKeyPlugin.class);
    registerPlugin(SessionFolderPlugin.class);
    registerPlugin(ArchiveStoragePlugin.class);
    registerPlugin(SharingBackgroundPlugin.class);
    registerPlugin(KnowledgeIndexingBackgroundPlugin.class);
    registerPlugin(PaddleOCRPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`)
