import {spawn,execFile} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const root=resolve('.cache/paddle-ocr/package'),executable=resolve(root,'paddle-ocr-worker.exe');
const deviceProbe=JSON.parse((await promisify(execFile)(executable,['--devices'],{timeout:15000})).stdout);
assert(Array.isArray(deviceProbe.devices));
const child=spawn(executable,['--models','.','--backend','cpu','--threads','4'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,OPENCV_IO_MAX_IMAGE_PIXELS:'16777216'}});
let buffer='',diagnostic='';const lines=[],waiters=[];
child.stderr.on('data',chunk=>diagnostic=(diagnostic+chunk.toString()).slice(-8000));
child.stdout.on('data',chunk=>{buffer+=chunk;for(;;){const at=buffer.indexOf('\n');if(at<0)break;const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(line.trim()){const waiter=waiters.shift();waiter?waiter(JSON.parse(line)):lines.push(JSON.parse(line))}}});
function next(){if(lines.length)return Promise.resolve(lines.shift());return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native worker timed out: '+diagnostic)),30000);waiters.push(value=>{clearTimeout(timer);resolve(value)});child.once('exit',()=>{clearTimeout(timer);reject(Error('Native worker exited: '+diagnostic))})})}
const report={version:1,deviceProbe,calls:[]};
try{
 const ready=await next();assert.equal(ready.backend,'cpu');assert.equal(ready.classes,838);report.ready=ready;
 for(const [fixture,terms]of [['simple',['CLIENTE ACME','TOTALE 120 EUR']],['columns',['INV-2026-017','Acme Italia','125.50','2510.00','ZX914']],['scan',['Quantità','Forlì','15/12/2026','2510,00']],['chart',['Devices delivered by quarter','Q1','Q2','20','30']]]){
  const image=(await readFile('native/paddle-ocr/fixtures/'+fixture+'.png')).toString('base64'),begin=performance.now();child.stdin.write(JSON.stringify({id:fixture,image})+'\n');const result=await next();assert.equal(result.id,fixture);assert.equal(result.error,undefined,JSON.stringify(result));assert.equal(result.backend,'cpu');const normalize=text=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,'');const checks=terms.map(term=>({term,found:normalize(result.text).includes(normalize(term))}));report.calls.push({fixture,ms:performance.now()-begin,...result,checks});assert(checks.every(x=>x.found),'Missing OCR anchors in '+fixture+': '+result.text);assert(result.regions.every(x=>x.polygon.flat().every(n=>Number.isFinite(n)&&n>=0&&n<=1)));console.log(fixture+': '+Math.round(report.calls.at(-1).ms)+' ms');
 }
}finally{child.stdin.end();await new Promise(resolve=>{child.once('close',resolve);setTimeout(()=>{child.kill();resolve()},3000).unref()});await mkdir('test-results/paddle-ocr',{recursive:true});await writeFile('test-results/paddle-ocr/native.json',JSON.stringify(report,null,2));}
