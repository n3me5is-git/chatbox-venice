import type { SessionResource } from './session-resources'

/** Serialize lazy image reads so a Markdown document cannot queue an unbounded byte burst. */
export class PreviewImages {
  private queue:Promise<unknown>=Promise.resolve()
  private closed=false
  private bytes=0
  private attempts=0
  constructor(private readonly read:(item:SessionResource)=>Promise<Uint8Array>,private readonly totalLimit=20*1024*1024,private readonly imageLimit=2*1024*1024){}
  activate(){this.closed=false}
  close(){this.closed=true}
  load(item:SessionResource):Promise<Blob|undefined>{
    const task=this.queue.catch(()=>{}).then(async()=>{
      if(this.closed||this.attempts>=64||this.bytes>=this.totalLimit||!item.mime.startsWith('image/')||(item.bytes!==undefined&&item.bytes>this.imageLimit))return
      this.attempts++
      const bytes=await this.read(item)
      try{
        if(this.closed||bytes.length>this.imageLimit||this.bytes+bytes.length>this.totalLimit)return
        this.bytes+=bytes.length
        return new Blob([Uint8Array.from(bytes)],{type:item.mime})
      }finally{bytes.fill(0)}
    })
    this.queue=task.catch(()=>{})
    return task
  }
}
