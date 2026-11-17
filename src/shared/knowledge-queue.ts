import type {IndexProgressReporter} from './knowledge-index-progress'

type Work<T> = () => Promise<T>
/** FIFO permits are shared by OCR, embeddings and extraction within one job.
 * Queued work owns no request; abort removes it before dispatch. */
export class KnowledgeQueue {
 private active=0
 private waiting:{start:()=>void;reject:(error:unknown)=>void}[]=[]
 constructor(readonly limit:number,private signal:AbortSignal,private report?:IndexProgressReporter){
  if(!Number.isInteger(limit)||limit<1||limit>8)throw Error('Choose between 1 and 8 parallel requests')
  signal.addEventListener('abort',()=>{const pending=this.waiting.splice(0);for(const row of pending)row.reject(signal.reason);this.update()},{once:true})
 }
 private update(){this.report?.({stage:'queue',activeRequests:this.active,queuedRequests:this.waiting.length,requestLimit:this.limit})}
 async run<T>(work:Work<T>):Promise<T>{
  this.signal.throwIfAborted()
  await new Promise<void>((resolve,reject)=>{this.waiting.push({start:()=>{this.active++;resolve()},reject});this.pump()})
  try{this.signal.throwIfAborted();return await work()}finally{this.active--;this.pump()}
 }
 private pump(){while(!this.signal.aborted&&this.active<this.limit&&this.waiting.length)this.waiting.shift()!.start();this.update()}
}
const runtimes=new WeakMap<AbortSignal,KnowledgeQueue>()
export const runKnowledgeRequest=<T>(signal:AbortSignal,work:Work<T>)=>runtimes.get(signal)?.run(work)??work()
export async function withKnowledgeQueue<T>(signal:AbortSignal,limit:number,work:(signal:AbortSignal)=>Promise<T>,report?:IndexProgressReporter):Promise<T>{
 if(runtimes.has(signal))return work(signal)
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason)
 signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
 runtimes.set(controller.signal,new KnowledgeQueue(limit,controller.signal,report))
 try{return await work(controller.signal)}finally{controller.abort();signal.removeEventListener('abort',abort);runtimes.delete(controller.signal)}
}
/** Bounded producer and consumers; errors drain in-flight work before callers
 * reclaim buffers or remove unpublished shards. No Promise.all over a corpus. */
export async function forEachKnowledge<T>(input:Iterable<T>|AsyncIterable<T>,limit:number,signal:AbortSignal,work:(value:T,index:number)=>Promise<void>){
 const iterator=Symbol.asyncIterator in input?(input as AsyncIterable<T>)[Symbol.asyncIterator]():(async function*(){yield* input as Iterable<T>})()
 let ordinal=0,failed=false,failure:unknown;let tail:Promise<unknown>=Promise.resolve()
 const next=()=>{const result=tail.then(async()=>{if(failed)return{done:true as const,value:undefined};signal.throwIfAborted();const item=await iterator.next();return{...item,index:ordinal++}});tail=result.catch(()=>{});return result}
 try{await Promise.all(Array.from({length:Math.max(1,Math.min(8,limit))},async()=>{while(!failed){try{const item=await next();if(item.done)return;await work(item.value,item.index!)}catch(error){failed=true;failure??=error}}}));if(failed)throw failure;signal.throwIfAborted()}finally{await iterator.return?.()}
}
/** Account for source buffers before reading. Unknown lengths reserve the whole
 * budget. Large documents therefore serialize without disabling small-file work. */
export class KnowledgeSourceBudget{
 private used=0
 private listeners=new Set<()=>void>()
 constructor(private maximum=52*1024*1024){}
 async run<T>(bytes:number|undefined,signal:AbortSignal,work:Work<T>):Promise<T>{
  const size=Math.max(1,Math.min(this.maximum,bytes||this.maximum))
  while(this.used+size>this.maximum){signal.throwIfAborted();await new Promise<void>((resolve,reject)=>{const finish=()=>{this.listeners.delete(wake);signal.removeEventListener('abort',abort)},wake=()=>{finish();resolve()},abort=()=>{finish();reject(signal.reason)};this.listeners.add(wake);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()})}
  signal.throwIfAborted();this.used+=size
  try{return await work()}finally{this.used-=size;for(const wake of [...this.listeners])wake()}
 }
}
