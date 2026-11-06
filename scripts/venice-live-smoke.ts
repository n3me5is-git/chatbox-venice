/** Optional local live verification. Build in Actions; credentials enter only at runtime.
 * No automatic generation retries. The driver exposes only bounded smoke scenarios. */
import Venice from '../src/shared/providers/definitions/models/venice'
import { VeniceMediaService, type MediaStore, type MediaRecord, type MediaCatalogCache, type MediaInput } from '../src/shared/providers/definitions/models/venice/media'
import type { ModelDependencies } from '../src/shared/types/adapters'
import { tool } from 'ai'
import { z } from 'zod'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
const origin='https://api.venice.ai/api/v1'
let active=false
type Ledger={date:string;video:number;music:number;speech:number;transcription:number;completions:number;entries:unknown[]}
export async function runSmoke(command:{action:string;apiKey:string;scratch:string;model?:string;engine?:string;privacy?:'standard'|'e2ee';transport?:'encrypted-text'|'native';options?:Record<string,unknown>}){
 if(active)throw Error('Only one live scenario may run at a time')
 active=true
 const scratch=path.resolve(command.scratch),out=path.resolve(scratch,'../outputs/live-venice-tests')
 const ledgerFile=path.join(scratch,'venice-live-budget.json')
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 let ledger:Ledger={date:today,video:0,music:0,speech:0,transcription:0,completions:0,entries:[]}
 try{const previous=JSON.parse(await readFile(ledgerFile,'utf8'));if(previous.date===today)ledger=previous}catch{}
 const requests:{path:string;status:number;ms:number}[]=[]
 const saveLedger=()=>writeFile(ledgerFile,JSON.stringify(ledger,null,2))
 try{
  await mkdir(out,{recursive:true})
  const catalog=JSON.parse(await readFile(path.join(scratch,'venice-live-catalog.json'),'utf8')).data as {id:string;type:string;model_spec:Record<string,any>}[]
  const request:ModelDependencies['request']['apiRequest']=async input=>{
   const url=new URL(input.url)
   if(url.origin!=='https://api.venice.ai'||!url.pathname.startsWith('/api/v1/'))throw Error('Unexpected live endpoint')
   const body=typeof input.body==='string'?JSON.parse(input.body):null
   const endpoint=url.pathname.slice('/api/v1'.length)
   if(['/video/queue','/audio/queue','/audio/speech','/audio/transcriptions','/chat/completions'].includes(endpoint)){
    const kind=endpoint==='/video/queue'?'video':endpoint==='/audio/queue'?'music':endpoint==='/audio/speech'?'speech':endpoint==='/audio/transcriptions'?'transcription':'completions'
    const limit=kind==='completions'?24:3
    if(ledger[kind]>=limit)throw Error('Daily smoke-test request limit reached')
    if(kind==='video'&&body?.duration!=='5s')throw Error('Live videos must be exactly five seconds')
    if(kind==='music'&&(!Number.isFinite(body?.duration_seconds)||body.duration_seconds>5||body.duration_seconds<1))throw Error('Live music must be at most five seconds')
    if(kind==='completions'&&Math.max(body?.max_tokens||0,body?.max_completion_tokens||0)>512)throw Error('Live completions are limited to 512 tokens')
    ledger[kind]++;ledger.entries.push({at:new Date().toISOString(),kind,model:body?.model||command.model,duration:body?.duration||body?.duration_seconds});await saveLedger()
   }
   const started=Date.now()
   const response=await fetch(url,{method:input.method,headers:input.headers,body:input.body as BodyInit,signal:input.signal||AbortSignal.timeout(60000),redirect:'error'})
   requests.push({path:endpoint,status:response.status,ms:Date.now()-started})
   if(endpoint.startsWith('/tee/')&&response.ok){const copy=await response.clone().json();await writeFile(path.join(scratch,endpoint.includes('attestation')?'live-attestation.json':'live-signature.json'),JSON.stringify(copy,null,2))}
   return response
  }
  if(command.action==='quote'){
   const kind=command.options?.kind==='music'?'audio':'video'
   const response=await request({url:origin+'/'+kind+'/quote',method:'POST',headers:{Authorization:'Bearer '+command.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:command.model,...Object.fromEntries(Object.entries(command.options||{}).filter(([key])=>key!=='kind'))}),retry:0,useProxy:false})
   return {action:command.action,model:command.model,status:response.status,body:await response.json(),requests}
  }
  if(['text','tools','search'].includes(command.action)){
   const selected=catalog.find(x=>x.id===command.model&&x.type==='text');if(!selected)throw Error('Choose a current text model')
   const dependencies={request:{apiRequest:request,fetchWithOptions:fetch},storage:{saveImage:async()=>'',getImage:async()=>''},sentry:{captureException:()=>{},withScope:()=>{}},getRemoteConfig:async()=>({}),platformType:'desktop'} as unknown as ModelDependencies
   const model=new Venice({apiKey:command.apiKey,apiHost:origin,model:{modelId:selected.id,providerId:'venice',capabilities:selected.model_spec.capabilities?.supportsFunctionCalling?['tool_use']:[],vendorMetadata:{...selected.model_spec,veniceType:'text'}},maxOutputTokens:512,venice:{webSearch:command.action==='search'?'auto':'off',searchProvider:(command.engine||'brave') as 'brave',textPrivacy:command.privacy||'standard',e2eeToolsEnabled:command.action==='tools'||command.action==='search',e2eeToolMode:command.transport||'encrypted-text'}},dependencies)
   let executions=0,text=''
   const tools=command.action==='tools'?{local_sum:tool({description:'Add two test integers locally.',inputSchema:z.object({a:z.number(),b:z.number()}),execute:async({a,b})=>{executions++;return{sum:a+b}}})}:undefined
   const prompt=command.action==='tools'?'Call local_sum with a=7 and b=5. After receiving the result, reply with the number 12 only.':command.action==='search'?'Use venice_web_search exactly once for "Venice AI API documentation" and cite one URL from its results.':'Reply with exactly: Live test OK'
   const events:string[]=[]
   for await(const part of model.chatStream([{role:'user',content:prompt}],{tools,maxSteps:3,signal:AbortSignal.timeout(90000),providerOptions:{openaiCompatible:{reasoningEffort:'none'}}})){
    events.push(part.type);const value=part as unknown as Record<string,unknown>;if(part.type==='text-delta')text+=String(value.text??value.delta??'')
    if(part.type==='error')throw Error(String(value.error))
   }
   return {action:command.action,model:selected.id,privacy:command.privacy||'standard',transport:command.transport,executions,text:text.slice(0,1000),events,requests}
  }
  if(!['speech','transcription','music','video','resume','cleanup'].includes(command.action))throw Error('Unknown smoke scenario')
  let records:MediaRecord[]=[];let cache:MediaCatalogCache|null=null
  const recordsFile=path.join(scratch,'venice-live-records.json'),assetsFile=path.join(scratch,'venice-live-assets.json')
  try{records=JSON.parse(await readFile(recordsFile,'utf8'))}catch{}
  let assets:Record<string,string>={};try{assets=JSON.parse(await readFile(assetsFile,'utf8'))}catch{}
  const store:MediaStore={read:async()=>records,write:async value=>{records=value;await writeFile(recordsFile,JSON.stringify(value,null,2))},readCatalog:async()=>cache,writeCatalog:async value=>{cache=value},
   putBlob:async(key,value)=>{const file=path.join(out,key.replace(/[^\w-]/g,'_')+(value.startsWith('data:text/')?'.txt':'.bin'));await writeFile(file,Buffer.from(value.slice(value.indexOf(',')+1),'base64'));assets[key]=file;await writeFile(assetsFile,JSON.stringify(assets))},
   getBlob:async key=>assets[key]?'data:application/octet-stream;base64,'+(await readFile(assets[key])).toString('base64'):null,deleteBlob:async()=>{},
   putStream:async(key,response,mime,signal)=>{const extension=({'audio/wav':'.wav','audio/x-wav':'.wav','audio/mpeg':'.mp3','audio/mp4':'.m4a','video/mp4':'.mp4'} as Record<string,string>)[mime]||'.audio';const file=path.join(out,key.replace(/[^\w-]/g,'_')+extension);await pipeline(Readable.fromWeb(response.body as any),createWriteStream(file+'.partial'),{signal});await rename(file+'.partial',file);assets[key]=file;await writeFile(assetsFile,JSON.stringify(assets));return true}}
  const service=new VeniceMediaService(store,()=>({apiKey:command.apiKey,options:{enabled:true,audioEnabled:true,musicEnabled:true,videoEnabled:true}}),request,2000)
  await service.catalog()
  if(command.action==='resume'||command.action==='cleanup'){
   const last=records.find(r=>r.queueId&&!r.remoteCleaned);if(!last)throw Error('No pending test generation')
   if(command.action==='resume')await service.resume(last.id);else await service.cleanup(last.id)
   return {action:command.action,record:records.find(r=>r.id===last.id),requests}
  }
  const options=command.options||{}
  const input:MediaInput={kind:command.action as MediaInput['kind'],model:command.model||'',prompt:command.action==='speech'?'Hello. This is a short Venice test.':command.action==='music'?'Five seconds of gentle instrumental piano, no vocals.':'A small blue cube rotates slowly on a plain white background. Static camera.',options,signal:AbortSignal.timeout(150000)}
  if(command.action==='transcription'){
   const source=records.find(r=>r.kind==='speech'&&r.blobKey);const file=source?.blobKey&&assets[source.blobKey];if(!file)throw Error('Create the short speech sample first')
   input.file=new File([await readFile(file)],'test.wav',{type:'audio/wav'});input.prompt=''
  }
  let quote:unknown
  if(['music','video'].includes(command.action)){
   const result=await service.quote(input) as {quote:number};quote=result.quote
   if(typeof quote!=='number'||quote<0||quote>(command.action==='video'?0.25:0.05))throw Error('Quote exceeds the bounded live-test budget')
  }
  const record=await service.start(input)
  return {action:command.action,quote,status:record.status,model:record.model,error:record.error,text:record.text,remoteCleaned:record.remoteCleaned,file:record.blobKey&&assets[record.blobKey],requests}
 }catch(error){return {action:command.action,model:command.model,error:error instanceof Error?error.message:String(error),requests}}
 finally{active=false}
}
