/** Build-runner only: bundle pinned native libraries; optional test weights. */
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
import AdmZip from 'adm-zip'
const metadata=JSON.parse(await readFile('src/shared/paddle-ocr-artifacts.json','utf8'))
const allowed=url=>url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='github.com'||url.hostname.endsWith('.githubusercontent.com'))
async function download(item){
 if(!item||!Number.isSafeInteger(item.bytes)||item.bytes<1||item.bytes>64*1024*1024||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Missing pinned PaddleOCR component')
 let url=new URL(item.url),response
 for(let n=0;n<8;n++){if(!allowed(url))throw Error('Untrusted PaddleOCR download');response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(60000)});if(response.status>=300&&response.status<400){await response.body?.cancel();url=new URL(response.headers.get('location'),url);continue}break}
 if(!response?.ok||!response.body)throw Error('Unable to download pinned PaddleOCR component')
 const blocks=[];let total=0;for await(const block of response.body){total+=block.length;if(total>item.bytes)throw Error('PaddleOCR component exceeded pinned size');blocks.push(block)}
 const bytes=Buffer.concat(blocks);if(bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('PaddleOCR component checksum mismatch');return new AdmZip(bytes)
}
const abis=['arm64-v8a','armeabi-v7a','x86_64'],zip=await download(metadata.android),found=new Set()
for(const entry of zip.getEntries()){
 if(!abis.some(abi=>entry.entryName===abi+'/libpaddle_ocr.so'))continue
 if(entry.header.size<1||entry.header.size>32*1024*1024)throw Error('Invalid native PaddleOCR library')
 const target=path.join('android/app/src/main/jniLibs',entry.entryName);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,entry.getData());found.add(entry.entryName.split('/')[0])
}
if(found.size!==abis.length)throw Error('Missing PaddleOCR Android ABI')
if(process.argv.includes('--test-models')){
 const models=await download(metadata.models),target='android/app/src/androidTest/assets/paddle-test-models';await mkdir(target,{recursive:true})
 for(const entry of models.getEntries()){if(entry.isDirectory||!/^[A-Za-z0-9_.-]+$/.test(entry.entryName)||entry.header.size>32*1024*1024)throw Error('Invalid PaddleOCR model archive');await writeFile(path.join(target,entry.entryName),entry.getData())}
 await copyFile('native/paddle-ocr/fixtures/simple.png','android/app/src/androidTest/assets/paddle-test.png')
}
console.log('Verified PaddleOCR native libraries: '+[...found].join(', '))
