import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
/** Print the actual exported HTML, offline, in a second isolated Chromium target. */
export async function checkPrintedExport(html,output){
  const target=await (await fetch('http://127.0.0.1:9222/json/new?about:blank',{method:'PUT'})).json()
  const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),external=[];let serial=0,onLoad=()=>{}
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const task=pending.get(message.id);if(task){pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result)}}if(message.method==='Page.loadEventFired')onLoad();if(message.method==='Network.requestWillBeSent'&&!/^(data:|blob:|about:)/.test(message.params.request.url))external.push(message.params.request.url)}
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Export browser timed out'))},30000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id,method,params}))})
  try{
    await command('Network.enable');await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
    await command('Page.enable');await command('Emulation.setDeviceMetricsOverride',{width:1000,height:1200,deviceScaleFactor:1,mobile:false})
    const loaded=new Promise(resolve=>{onLoad=resolve});await command('Page.navigate',{url:'data:text/html;charset=utf-8,'+encodeURIComponent(html)});await loaded
    const result=await command('Runtime.evaluate',{expression:'new Promise(resolve=>{const ready=async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images,image=>image.decode().catch(()=>{})));resolve({text:document.body.innerText,images:Array.from(document.images,image=>({complete:image.complete,width:image.naturalWidth})),fonts:document.fonts.size})};if(document.readyState==="complete")ready();else addEventListener("load",ready,{once:true})})',returnByValue:true,awaitPromise:true})
    if(result.exceptionDetails)throw Error('Exported HTML failed to load')
    const content=result.result.value;assert.ok(content.text.includes('Local report'));assert.ok(content.images.length>=2);assert.ok(content.images.every(image=>image.complete&&image.width>0));assert.ok(content.fonts>10)
    const pdf=await command('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});const bytes=Buffer.from(pdf.data,'base64');assert.ok(bytes.subarray(0,5).toString()==='%PDF-')
    await writeFile(path.join(output,'markdown-export.pdf'),bytes);await writeFile(path.join(output,'markdown-export.html'),html)
    await writeFile(path.join(output,'markdown-export-offline.png'),Buffer.from((await command('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'))
    assert.deepEqual(external,[],'Standalone Markdown export contacted an external resource')
    await writeFile(path.join(output,'markdown-export-report.json'),JSON.stringify({offline:true,pdfBytes:bytes.length,images:content.images.length,fonts:content.fonts,externalRequests:external},null,2))
  }finally{socket.close();await fetch('http://127.0.0.1:9222/json/close/'+target.id).catch(()=>{})}
}
