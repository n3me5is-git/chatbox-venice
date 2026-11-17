import {createServer} from 'node:http'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
const output='test-results/android-production-ui',app='io.github.n3me5is.chatboxvenice'
await mkdir(output,{recursive:true})
await build({stdin:{contents:"export {createDefaultSettings} from './packages/chatbox-core/src/domain/settings/settings-defaults'; export {encodePersistedSettings} from './packages/chatbox-core/src/domain/settings/settings-migrations'",resolveDir:process.cwd()},outfile:output+'/defaults.mjs',bundle:true,platform:'node',format:'esm'})
const {createDefaultSettings,encodePersistedSettings}=await import(pathToFileURL(resolve(output+'/defaults.mjs')))
const fixtureDefaults=encodePersistedSettings({...createDefaultSettings(),languageInited:true})
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:30000}).trim(),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
assert.equal(adb('shell','getprop','ro.kernel.qemu'),'1','This destructive fixture is for disposable emulators only')
adb('install','-r','android/app/build/outputs/apk/debug/app-debug.apk')
adb('shell','pm','grant',app,'android.permission.POST_NOTIFICATIONS')
adb('shell','am','start','-n',app+'/.MainActivity')
let socket,serial=0,pending=new Map(),cdp,evaluate,embeddingRequest,started,requestAt
const fixtureRequests=[]
const server=createServer(async(request,response)=>{fixtureRequests.push({method:request.method,path:request.url});response.setHeader('Access-Control-Allow-Origin','*');response.setHeader('Access-Control-Allow-Private-Network','true');response.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');response.setHeader('Access-Control-Allow-Headers',request.headers['access-control-request-headers']||'Authorization, Content-Type');if(request.method==='OPTIONS'){response.writeHead(204).end();return}let body='';for await(const chunk of request){body+=chunk;if(body.length>1024*1024){response.writeHead(413).end();return}}response.setHeader('Content-Type','application/json');if(request.url.includes('/embeddings')){embeddingRequest={response,body:JSON.parse(body)};requestAt=Date.now()}else response.end(JSON.stringify({data:[{id:'fixture-embedding',type:'embedding',model_spec:{name:'Fixture embedding',privacy:'private'}}]}))});await new Promise(resolve=>server.listen(4176,'127.0.0.1',resolve))
const report={device:'Android emulator API35',actualProductionApp:true,syntheticProvider:true,cloudModelCalls:0,fixtureRequests,networkErrors:[]},errors=[]
async function wait(check,message,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){try{const value=await check();if(value)return value}catch{}await delay(150)}throw Error(message)}
const snap=async name=>{if(evaluate)await evaluate(`document.visibilityState==='visible'?Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise(resolve=>setTimeout(resolve,500))]):true`);await delay(150);await writeFile(output+'/'+name+'.png',execFileSync('adb',['exec-out','screencap','-p'],{timeout:30000}))}
try{
 const connect=async()=>{
 const pid=await wait(()=>adb('shell','pidof',app),'App process did not start')
 adb('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid)
 const target=await wait(async()=>{const rows=await(await fetch('http://127.0.0.1:9223/json')).json();return rows.find(row=>row.type==='page')},'Production WebView debugger unavailable')
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
 cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id,method,params}))})
 socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result)}}
  if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)
  if(message.method==='Network.loadingFailed')report.networkErrors.push({error:message.params.errorText,blockedReason:message.params.blockedReason,cors:message.params.corsErrorStatus})
  if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error'){errors.push(message.params.args.map(arg=>arg.value||arg.description||arg.type).join(' '));for(const arg of message.params.args)if(arg.objectId)void cdp('Runtime.callFunctionOn',{objectId:arg.objectId,functionDeclaration:'function(){try{return this instanceof Error?this.stack:JSON.stringify(this)}catch{return String(this)}}',returnByValue:true}).then(result=>errors.push(String(result.result.value).slice(0,3000))).catch(()=>{})}
  if(message.method==='Fetch.requestPaused'){const {requestId,request}=message.params;if(request.url.includes('fixture.invalid')){
    if(request.url.includes('/embeddings')){embeddingRequest={requestId,body:JSON.parse(request.postData)};requestAt=Date.now()}
    else void cdp('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({data:[{id:'fixture-embedding',type:'embedding',model_spec:{name:'Fixture embedding',privacy:'private'}}]})).toString('base64')})
   }else void cdp('Fetch.continueRequest',{requestId})}
 }
 evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable')
 }
 await connect()
 await wait(()=>evaluate(`!!window.Capacitor?.nativePromise&&!!document.getElementById('root')?.children.length&&!document.querySelector('.startup-error')`),'Production renderer did not initialize',90000)
 await wait(()=>evaluate(`window.Capacitor.nativePromise('CapacitorSQLite','query',{database:'chatbox.db',statement:"SELECT value FROM key_value WHERE key='settings'",values:[]}).then(rows=>JSON.parse(rows.values?.[0]?.value||'null')?.languageInited===true)`),'First-launch language initialization did not settle')
 await delay(1500)
 // Seed only this disposable app's real SQLite settings, never production source/test hooks.
 await evaluate(`(async()=>{const call=(method,args)=>window.Capacitor.nativePromise('CapacitorSQLite',method,args);const rows=await call('query',{database:'chatbox.db',statement:"SELECT value FROM key_value WHERE key='settings'",values:[]});const settings={...${JSON.stringify(fixtureDefaults)},...JSON.parse(rows.values?.[0]?.value||'null')};Object.assign(settings,{language:'it-IT',languageInited:true,theme:0,defaultEmbeddingModel:{provider:'venice',model:'fixture-embedding'}});settings.providers={...settings.providers,venice:{apiKey:'SYNTHETIC-UI-FIXTURE',apiHost:'http://10.0.2.2:4176/api/v1',models:[{modelId:'fixture-embedding',type:'embedding'}],venice:{enabled:true}}};await call('run',{database:'chatbox.db',statement:"INSERT OR REPLACE INTO key_value(key,value) VALUES ('settings',?)",values:[JSON.stringify(settings)]});})()`)
 report.seededSettings=await evaluate(`(async()=>{const call=(method,args)=>window.Capacitor.nativePromise('CapacitorSQLite',method,args);const rows=await call('query',{database:'chatbox.db',statement:"SELECT value FROM key_value WHERE key='settings'",values:[]});return JSON.parse(rows.values?.[0]?.value||'null')})().then(s=>({language:s?.language,initialized:s?.languageInited,embedding:s?.defaultEmbeddingModel,syntheticProvider:s?.providers?.venice?.apiKey==='SYNTHETIC-UI-FIXTURE'}))`);assert.equal(report.seededSettings.language,'it-IT')
 socket.close();adb('shell','am','force-stop',app);adb('shell','am','start','-n',app+'/.MainActivity');await connect()
 await wait(()=>evaluate(`!!document.querySelector('.startup-error')||document.readyState==='complete'&&document.body.innerText.length>30`),'App did not restart')
 assert.equal(await evaluate(`!!document.querySelector('.startup-error')`),false,'Production app startup failed: '+errors.join(' | '))
 await delay(2500);report.restartedSettings=await evaluate(`(async()=>{const call=(method,args)=>window.Capacitor.nativePromise('CapacitorSQLite',method,args);const rows=await call('query',{database:'chatbox.db',statement:"SELECT value FROM key_value WHERE key='settings'",values:[]});return JSON.parse(rows.values?.[0]?.value||'null')})().then(s=>({language:s?.language,initialized:s?.languageInited,embedding:s?.defaultEmbeddingModel,syntheticProvider:s?.providers?.venice?.apiKey==='SYNTHETIC-UI-FIXTURE'}))`);assert.equal(report.restartedSettings.language,'it-IT','Persisted fixture settings changed on restart');await evaluate(`location.hash='/settings/knowledge-base'`)
 await wait(()=>evaluate(`!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Nuova raccolta')`),'Actual native KB did not open',90000)
 const buttons=await evaluate(`['Nuova raccolta','Apri collezione da cartella'].map(text=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text);if(!e)return null;const r=e.getBoundingClientRect();return {text,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})`)
 assert.ok(buttons.every(Boolean),'Native folder action must actually be present');const width=await evaluate('innerWidth');assert.ok(buttons.every(b=>b.width>=width-48&&b.height>=44),'Native actions are not readable full-width controls');assert.ok(buttons[1].y>=buttons[0].bottom+4,'Native buttons overlap');report.buttons=buttons;report.viewport=await evaluate('({width:innerWidth,height:innerHeight,theme:document.documentElement.dataset.theme})');await snap('native-knowledge-it-dark')
 const clickExpression=async expression=>{let box,previous;const end=Date.now()+10000;while(Date.now()<end){const value=await evaluate(`(async()=>{const e=${expression};if(!e||e.disabled)return null;e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(!r.width||!r.height||y<0||y>=innerHeight||!(hit===e||e.contains(hit)))return null;return{x,y}})()`);if(value&&previous&&Math.abs(value.x-previous.x)<.5&&Math.abs(value.y-previous.y)<.5){box=value;break}previous=value;await delay(60)}if(!box)throw Error('Native control missing, disabled or obscured: '+expression);await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[box]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
 const click=text=>clickExpression(`[...document.querySelectorAll('button')].findLast(e=>e.textContent.trim()===${JSON.stringify(text)})`)
 await click('Nuova raccolta');await wait(()=>evaluate(`!!document.querySelector('[role="dialog"] input')`),'Collection setup did not open')
 report.formInputs=await evaluate(`[...document.querySelectorAll('[role="dialog"] input')].map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:e.id,type:e.type,width:r.width,height:r.height,x:r.x,y:r.y,visibility:getComputedStyle(e).visibility,hit:hit?.tagName,hitClass:hit?.className,label:document.querySelector('label[for="'+CSS.escape(e.id)+'"]')?.textContent}})`)
 await clickExpression(`[...document.querySelectorAll('[role="dialog"] label')].findLast(e=>e.textContent.trim()==='Nome della raccolta')`)
 await wait(()=>evaluate(`document.activeElement?.tagName==='INPUT'&&document.activeElement.type==='text'`),'Native text input did not gain focus')
 // WebView's CDP insertText acknowledges the command without entering text on
 // some Android system images. Send actual Android input events to its focused field.
 adb('shell','input','text','NativePDFFixture')
 await wait(()=>evaluate(`[...document.querySelectorAll('[role="dialog"] input')].some(e=>e.type==='text'&&e.value==='NativePDFFixture')`),'Native text input did not receive typing')
 await evaluate(`document.activeElement?.blur();window.Capacitor.nativePromise('Keyboard','hide',{}).catch(()=>{})`)
 await clickExpression(`[...document.querySelectorAll('[role="dialog"] .mantine-Checkbox-label')].find(e=>e.textContent.startsWith('Consento ai provider selezionati per embedding/OCR/STT'))`)
 await wait(()=>evaluate(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Crea raccolta'&&!e.disabled)`),'Native collection consent/name did not enable submission')
 await snap('native-create-ready')
 await click('Crea raccolta');await wait(()=>evaluate(`!!document.querySelector('[data-testid="collection-documents"]')`),'Native encrypted collection was not created')
 // A minimal valid single-page PDF. DOM file injection exercises the actual upload handler/vault.
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 560] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],text='BT /F1 20 Tf 40 500 Td (Native PDF fixture) Tj ET';objects.push('<< /Length '+text.length+' >>\nstream\n'+text+'\nendstream');let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n'});const xref=pdf.length;pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'
 await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(pdf)}],'native-fixture.pdf',{type:'application/pdf'}));const input=document.querySelector('[data-testid="collection-documents"] input[type="file"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
 await wait(()=>evaluate(`document.body.innerText.includes('native-fixture.pdf')`),'Native source import failed')
 await click('Leggi documento');await wait(()=>evaluate(`!!document.querySelector('[data-testid="pdf-document-viewer"] canvas')&&document.querySelector('[data-testid="pdf-document-viewer"] canvas').width>100&&document.querySelector('[data-testid="pdf-document-viewer"]').getAttribute('aria-busy')==='false'`),'Actual Android PDF did not render')
 assert.ok(await evaluate(`(()=>{const c=document.querySelector('[data-testid="pdf-document-viewer"] canvas'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((v,i)=>i%4!==3&&v<100&&p[i-i%4+3]===255)})()`),'PDF canvas has no dark content');await snap('native-pdf-source');report.originalPdfRendered=true
 await evaluate(`[...document.querySelectorAll('[role="dialog"]')].at(-1).querySelector('.mantine-CloseButton-root').click()`)
 started=Date.now();await click('Indicizza ora');await wait(()=>embeddingRequest,'Actual index did not request embeddings')
 report.localPreparationMs=requestAt-started;assert.equal(embeddingRequest.body.model,'fixture-embedding');report.embeddingBatchSize=embeddingRequest.body.input.length
 const foreground=await evaluate(`window.Capacitor.nativePromise('KnowledgeIndexingBackground','status',{}).then(v=>v.active)`);assert.equal(foreground,true,'Indexing foreground service did not start')
 adb('shell','input','keyevent','3');await delay(1500)
 assert.equal(await evaluate(`window.Capacitor.nativePromise('KnowledgeIndexingBackground','status',{}).then(v=>v.active)`),true,'Foreground service stopped on HOME')
 embeddingRequest.response.end(JSON.stringify({data:embeddingRequest.body.input.map((_,index)=>({index,embedding:[1,0]})),usage:{total_tokens:20}}))
 await wait(()=>evaluate(`window.Capacitor.nativePromise('KnowledgeIndexingBackground','status',{}).then(v=>!v.active)`),'Foreground indexing did not finish while the app was hidden')
 adb('shell','am','start','-n',app+'/.MainActivity');await wait(()=>evaluate(`!!document.querySelector('[data-testid="indexing-status"]')&&document.querySelector('[data-testid="indexing-status"]').innerText.includes('Indicizzato')`),'Completed background index was not published');await snap('native-indexing-completed');report.backgroundIndexingCompleted=true;report.actualKeystoreAndSQLite=true;report.passed=true
}catch(error){report.passed=false;report.error=String(error);try{if(cdp)await snap('failure');if(evaluate)report.body=await evaluate('document.body.innerText');report.logcat=adb('logcat','-d','-t','300').slice(-30000)}catch{}throw error}finally{report.browserErrors=errors;await writeFile(output+'/report.json',JSON.stringify(report,null,2));socket?.close();if(embeddingRequest?.response&&!embeddingRequest.response.writableEnded)embeddingRequest.response.end('{}');server.close()}
