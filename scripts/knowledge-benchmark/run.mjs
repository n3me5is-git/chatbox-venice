import {build} from 'esbuild'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir,cpus,totalmem} from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const output=path.resolve('test-results/knowledge-benchmarks'),count=Number(process.env.KNOWLEDGE_BENCHMARK_DOCUMENTS||1000)
assert(Number.isSafeInteger(count)&&count>=2&&count<=2000,'Invalid synthetic corpus size')
await mkdir(output,{recursive:true})
const bundle=await build({entryPoints:['scripts/knowledge-benchmark/browser.ts'],bundle:true,write:false,platform:'browser',format:'esm',target:'chrome120',sourcemap:false})
const server=createServer((req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'none'");if(req.url==='/driver.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents)}else if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Encrypted knowledge benchmark</title><script type="module" src="/driver.js"></script>')}else{res.statusCode=404;res.end()}})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,profile=await mkdtemp(path.join(tmpdir(),'knowledge-browser-'))
const chrome=spawn(process.env.CHROME_PATH||'/usr/bin/google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--remote-debugging-port=9333','--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']})
let chromeLog='',socket,serial=0,launchError;chrome.stderr.on('data',value=>{chromeLog+=value});chrome.on('error',error=>{launchError=error});const pending=new Map(),exceptions=[],requests=[]
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function wait(work,message,maximum=30000){const deadline=Date.now()+maximum;while(Date.now()<deadline){if(launchError)throw launchError;try{const value=await work();if(value)return value}catch{}await delay(100)}throw Error(message)}
let cdp,evaluate
try{
 const target=await wait(async()=>(await(await fetch('http://127.0.0.1:9333/json/list')).json()).find(tab=>tab.type==='page'),'Benchmark Chromium did not start')
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
 socket.onmessage=message=>{const event=JSON.parse(message.data);if(event.id){const task=pending.get(event.id);if(task){pending.delete(event.id);event.error?task.reject(Error(event.error.message)):task.resolve(event.result)}}if(event.method==='Runtime.exceptionThrown')exceptions.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);if(event.method==='Network.requestWillBeSent')requests.push(event.params.request.url)}
 cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},20000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id,method,params}))})
 evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
 await cdp('Runtime.enable');await cdp('Network.enable');await cdp('Page.enable');await cdp('Page.navigate',{url:origin+'/'})
 await wait(()=>evaluate('typeof window.runKnowledgeBenchmark === "function"'),'Benchmark module did not load')
 await evaluate('window.runKnowledgeBenchmark('+count+').then(result=>{window.knowledgeBenchmarkResult=result},error=>{window.knowledgeBenchmarkError=String(error.stack||error)});undefined')
 let lastPhase;const deadline=Date.now()+300000
 while(Date.now()<deadline){
  const state=await evaluate('({result:window.knowledgeBenchmarkResult,error:window.knowledgeBenchmarkError,progress:window.knowledgeBenchmarkPhase})')
  if(state.progress&&JSON.stringify(state.progress)!==lastPhase){lastPhase=JSON.stringify(state.progress);await writeFile(path.join(output,'chromium-progress.json'),JSON.stringify(state.progress,null,2));console.log('KNOWLEDGE_BROWSER_PHASE '+JSON.stringify(state.progress.phases.at(-1)))}
  if(state.error)throw Error(state.error)
  if(state.result){
   assert.deepEqual(exceptions,[],'Browser exceptions');assert.deepEqual(requests.filter(url=>!url.startsWith(origin+'/')),[],'Benchmark requested an external service')
   const report={...state.result,commit:process.env.GITHUB_SHA,browser:await cdp('Browser.getVersion'),runner:{platform:process.platform,arch:process.arch,node:process.version,logicalCpus:cpus().length,cpu:cpus()[0]?.model,totalMemoryBytes:totalmem(),virtualizedCI:!!process.env.CI},externalRequests:0}
   await writeFile(path.join(output,'encrypted-chromium-'+count+'.json'),JSON.stringify(report,null,2));console.log('KNOWLEDGE_ENCRYPTED_BROWSER_BENCHMARK '+JSON.stringify(report));process.exitCode=0;break
  }
  await delay(500)
 }
 if(!lastPhase||!await evaluate('!!window.knowledgeBenchmarkResult'))throw Error('Encrypted browser benchmark exceeded five minutes')
}finally{socket?.close();chrome.kill('SIGTERM');await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,'chromium.log'),chromeLog)}
