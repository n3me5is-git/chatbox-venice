/** Fair in-process read/write gate, used when Web Locks are unavailable. */
export class KnowledgeAccessGate{
 private readers=0;private writer=false;private queue:{write:boolean;run:()=>void}[]=[]
 private drain(){if(this.writer)return;while(this.queue.length){const next=this.queue[0];if(next.write&&this.readers)return;this.queue.shift();if(next.write){this.writer=true;next.run();return}this.readers++;next.run()}}
 private async run<T>(write:boolean,work:()=>Promise<T>){await new Promise<void>(resolve=>{this.queue.push({write,run:resolve});this.drain()});try{return await work()}finally{if(write)this.writer=false;else this.readers--;this.drain()}}
 read<T>(work:()=>Promise<T>){return this.run(false,work)}
 publish<T>(work:()=>Promise<T>){return this.run(true,work)}
}
