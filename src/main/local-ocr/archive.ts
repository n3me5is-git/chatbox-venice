import AdmZip from 'adm-zip'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {writeFile,mkdir,readdir,chmod,lstat} from 'node:fs/promises'
import {join,relative,resolve,dirname} from 'node:path'
import type {OcrArtifact} from './artifacts'
export function archivePath(name:string){return !!name&&!name.includes('\\')&&!name.startsWith('/')&&!name.includes(':')&&!name.split('/').includes('..')}
/** Called only for an archive whose pinned size and SHA-256 have been verified. */
export async function extractOcrRuntime(artifact:OcrArtifact,archive:string,directory:string){
 if(artifact.name.endsWith('.zip')){
  const zip=new AdmZip(archive),entries=zip.getEntries();if(entries.length>2000||entries.reduce((sum,entry)=>sum+entry.header.size,0)>512*1024*1024)throw Error('Invalid local OCR runtime archive')
  for(const entry of entries){if(!archivePath(entry.entryName)||((entry.attr>>>16)&0xf000)===0xa000)throw Error('Invalid local OCR runtime archive');const target=resolve(directory,entry.entryName);if(relative(directory,target).startsWith('..'))throw Error('Invalid local OCR runtime archive');if(entry.isDirectory)await mkdir(target,{recursive:true});else{await mkdir(dirname(target),{recursive:true});await writeFile(target,entry.getData(),{mode:0o700})}}
 }else{
  const exec=promisify(execFile),listed=await exec('tar',['-tzf',archive],{windowsHide:true,maxBuffer:1024*1024,timeout:30000}),names=listed.stdout.trim().split(/\r?\n/);if(names.length>2000||names.some(name=>!archivePath(name)))throw Error('Invalid local OCR runtime archive');await exec('tar',['-xzf',archive,'-C',directory],{windowsHide:true,timeout:60000})
 }
 const find=async(dir:string):Promise<string|undefined>=>{for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if((await lstat(path)).isSymbolicLink())continue;if(item.isDirectory()){const found=await find(path);if(found)return found}else if(item.name==='llama-server'||item.name==='llama-server.exe')return path}return undefined}
 const executable=await find(directory);if(!executable)throw Error('The local OCR runtime has no llama-server executable');await chmod(executable,0o700);return relative(directory,executable).replace(/\\/g,'/')
}
