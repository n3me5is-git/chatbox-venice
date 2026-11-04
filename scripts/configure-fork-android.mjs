import { readFileSync, writeFileSync } from 'node:fs'

const manifest = 'android/app/src/main/AndroidManifest.xml'
let xml = readFileSync(manifest, 'utf8')
xml = xml.replace('<application', '<application android:usesCleartextTraffic="false"')
writeFileSync(manifest, xml)
