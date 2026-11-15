import {createHash} from 'node:crypto'
import {createReadStream,createWriteStream} from 'node:fs'
import {mkdir,lstat,rename,rm,stat} from 'node:fs/promises'
import {dirname} from 'node:path'
import {Readable,Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'
export type OcrArtifact={name:string;bytes:number;sha256:string;url:string}
const revision='0133ad8db635210441a55dcf421e25bfb9915142'
const model=(name:string,bytes:number,sha256:string):OcrArtifact=>({name,bytes,sha256,url:'https://huggingface.co/openbmb/MiniCPM-OCR-1.0-gguf/resolve/'+revision+'/'+name})
export const OCR_WEIGHTS={
 q4:model('MiniCPM-OCR-1_0-Q4_K_M.gguf',529106816,'c80a703400633f298cc2fddf6d493a541be36918c0801c0b1bf3f14c5703ce49'),
 q8:model('MiniCPM-OCR-1_0-Q8_0.gguf',811598432,'791486a476bdacb48acb3f31aa3a18dbb5be87e723a4074bcd13a37d61c852e2'),
 projector:model('mmproj-model-f16-4x.gguf',901017536,'ceed82261b3b1380c3165f8b37c10117a50093be1362cbfeeb692fa036444682'),
}
const runtime=(name:string,bytes:number,sha256:string):OcrArtifact=>({name,bytes,sha256,url:'https://github.com/ggml-org/llama.cpp/releases/download/b11901/'+name})
export const OCR_RUNTIMES={
 'win32-x64-cpu':runtime('llama-b11901-bin-win-cpu-x64.zip',24228082,'039951745399d7c1228b1e882d6e41b24d393f1795e3a6e176162bfb8193500a'),
 'win32-x64-vulkan':runtime('llama-b11901-bin-win-vulkan-x64.zip',37052720,'6e3a253f45117d1aec2adb2de0699ded0f6dccb683a798802d9e0dabae291f2c'),
 'linux-x64-cpu':runtime('llama-b11901-bin-ubuntu-x64.tar.gz',22496063,'7c15e703cf4589e90371b51de0ed6ff1107df63b5f86e8d3c396019388be1fa8'),
 'linux-x64-vulkan':runtime('llama-b11901-bin-ubuntu-vulkan-x64.tar.gz',35162311,'a11d56ec232dec8d4611ba5b93412ab50c363255ab2fb4b005bb1d3499956c24'),
} as Record<string,OcrArtifact>
export async function fileHash(path:string,signal?:AbortSignal){const hash=createHash('sha256');for await(const chunk of createReadStream(path)){signal?.throwIfAborted();hash.update(chunk)}return hash.digest('hex')}
export async function matches(path:string,artifact:OcrArtifact,hash=false){try{const info=await lstat(path);return info.isFile()&&!info.isSymbolicLink()&&info.size===artifact.bytes&&(!hash||await fileHash(path)===artifact.sha256)}catch{return false}}
export function allowedDownloadUrl(value:string){const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(url.hostname==='github.com'||url.hostname==='huggingface.co'||url.hostname.endsWith('.githubusercontent.com')||url.hostname.endsWith('.huggingface.co')||url.hostname.endsWith('.hf.co')||url.hostname.endsWith('.xethub.hf.co'))}
export async function downloadArtifact(artifact:OcrArtifact,path:string,signal:AbortSignal,progress:(bytes:number)=>void,fetcher:typeof fetch=fetch){
 await mkdir(dirname(path),{recursive:true,mode:0o700});if(await matches(path,artifact,true)){progress(artifact.bytes);return}
 const partial=path+'.part';await rm(partial,{force:true});let url=artifact.url,response:Response|undefined
 try{
  for(let redirects=0;redirects<8;redirects++){if(!allowedDownloadUrl(url))throw Error('Untrusted local OCR download URL');response=await fetcher(url,{signal,redirect:'manual'});if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Invalid download redirect');url=new URL(location,url).href;continue}break}
  if(!response?.ok||!response.body)throw Error('Local OCR download failed')
  const length=response.headers.get('content-length');if(length&&Number(length)!==artifact.bytes)throw Error('Local OCR download size mismatch')
  let bytes=0;const hash=createHash('sha256'),check=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>artifact.bytes){callback(Error('Local OCR download size mismatch'));return}hash.update(chunk);progress(bytes);callback(null,chunk)}})
  await pipeline(Readable.fromWeb(response.body as any),check,createWriteStream(partial,{flags:'wx',mode:0o600}),{signal})
  if(bytes!==artifact.bytes||hash.digest('hex')!==artifact.sha256)throw Error('Local OCR download checksum mismatch')
  await rename(partial,path)
 }catch(error){await rm(partial,{force:true});throw error}
}
export async function importWeight(source:string,target:string,artifact:OcrArtifact,signal:AbortSignal){
 const info=await stat(source);if(!info.isFile()||info.size!==artifact.bytes)throw Error('Choose the matching official MiniCPM GGUF file')
 await mkdir(dirname(target),{recursive:true,mode:0o700});const pending=target+'.import';await rm(pending,{force:true});let bytes=0;const hash=createHash('sha256')
 try{await pipeline(createReadStream(source),new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;hash.update(chunk);callback(null,chunk)}}),createWriteStream(pending,{flags:'wx',mode:0o600}),{signal});if(bytes!==artifact.bytes||hash.digest('hex')!==artifact.sha256)throw Error('Choose the matching official MiniCPM GGUF file');await rename(pending,target)}catch(error){await rm(pending,{force:true});throw error}
}
