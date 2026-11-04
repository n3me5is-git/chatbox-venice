import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'

const manifest = 'android/app/src/main/AndroidManifest.xml'
let xml = readFileSync(manifest, 'utf8')
xml = xml.replace('<application', '<application android:usesCleartextTraffic="false"')
writeFileSync(manifest, xml)
const version = JSON.parse(readFileSync('release/app/package.json', 'utf8')).version
const gradle = 'android/app/build.gradle'
writeFileSync(gradle, readFileSync(gradle, 'utf8')
  .replace(/versionCode\s+\d+/, `versionCode ${1000000 + Number(process.env.GITHUB_RUN_NUMBER || 1)}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`))
const javaDir = 'android/app/src/main/java/io/github/n3me5is/chatboxvenice'
copyFileSync('native/android/DocumentSaverPlugin.java', `${javaDir}/DocumentSaverPlugin.java`)
writeFileSync(`${javaDir}/MainActivity.java`, `package io.github.n3me5is.chatboxvenice;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DocumentSaverPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`)
