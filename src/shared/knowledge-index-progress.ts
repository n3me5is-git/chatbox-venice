export type IndexStage='queued'|'reading'|'extracting'|'ocr'|'transcribing'|'chunking'|'embedding'|'analyzing'|'saving'|'vectors-ready'|'reused'|'done'|'failed'|'cancelled'|'usage'
export interface IndexProgressEvent{
 stage:IndexStage;path?:string;page?:number;pages?:number;batch?:number;batches?:number;chunks?:number
 provider?:string;model?:string;inputTokens?:number;outputTokens?:number;estimatedInputTokens?:number;message?:string
}
export type IndexProgressReporter=(event:IndexProgressEvent)=>void
export interface IndexFileProgress{path:string;stage:IndexStage;started:number;updated:number;page?:number;pages?:number;chunks?:number;message?:string}
export interface IndexUsage{provider:string;model:string;inputTokens:number;outputTokens:number;estimatedInputTokens:number;calls:number;unreportedCalls:number}
export interface IndexJobProgress{id:number;name:string;stage:IndexStage;started:number;updated:number;path?:string;files:Record<string,IndexFileProgress>;usage:Record<string,IndexUsage>;error?:string}

/** Runtime-only progress survives route changes. Content and filenames are never logged. */
export class IndexProgressRegistry{
 private jobs=new Map<number,IndexJobProgress>();private revision=0;private listeners=new Set<()=>void>()
 snapshot=()=>this.revision
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private emit(){this.revision++;for(const listener of this.listeners)listener()}
 get(id:number){return this.jobs.get(id)}
 all(){return [...this.jobs.values()]}
 start(id:number,name:string,paths:string[]){const now=Date.now();this.jobs.set(id,{id,name,stage:'queued',started:now,updated:now,files:Object.fromEntries(paths.map(path=>[path,{path,stage:'queued' as const,started:0,updated:now}])),usage:{}});this.emit()}
 report(id:number,event:IndexProgressEvent){const current=this.jobs.get(id);if(!current)return;const now=Date.now(),job={...current,updated:now},path=event.path||current.path
  if(event.stage==='usage'){const key=event.provider+':'+event.model,old=job.usage[key]||{provider:event.provider||'',model:event.model||'',inputTokens:0,outputTokens:0,estimatedInputTokens:0,calls:0,unreportedCalls:0};job.usage={...job.usage,[key]:{...old,inputTokens:old.inputTokens+(event.inputTokens||0),outputTokens:old.outputTokens+(event.outputTokens||0),estimatedInputTokens:old.estimatedInputTokens+(event.estimatedInputTokens||0),calls:old.calls+1,unreportedCalls:old.unreportedCalls+(event.inputTokens===undefined?1:0)}}}
  else{job.stage=event.stage;if(path){job.path=path;const old=job.files[path]||{path,started:now,updated:now,stage:event.stage};job.files={...job.files,[path]:{...old,...event,path,started:old.started||now,updated:now}}}}
  this.jobs.set(id,job);this.emit()
 }
 finish(id:number,error?:unknown,files?:{path:string}[]){const current=this.jobs.get(id);if(!current)return;const now=Date.now(),stage=error?(error instanceof DOMException&&error.name==='AbortError'?'cancelled':'failed'):'done',indexed=files?new Set(files.map(file=>file.path)):undefined
  this.jobs.set(id,{...current,stage,updated:now,error:error instanceof Error?error.message:error?String(error):undefined,files:Object.fromEntries(Object.entries(current.files).map(([path,file])=>[path,{...file,stage:!error&&indexed?.has(path)?'done':file.stage,updated:now}]))});this.emit()
 }
 clear(id:number){this.jobs.delete(id);this.emit()}
}
