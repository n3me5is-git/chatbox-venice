export const PYTHON_MESSAGE_CHANNEL='chatbox-session-python'
/** Restrict the pinned module's declared memory maximum before instantiation. */
export function limitPythonMemory(source:Uint8Array){
  const bytes=source.slice();let offset=8
  const read=()=>{let value=0,shift=0,byte:number;do{if(offset>=bytes.length||shift>28)throw new Error('Invalid Python WASM module');byte=bytes[offset++];value+=(byte&127)*2**shift;shift+=7}while(byte&128);return value}
  while(offset<bytes.length){
    const section=bytes[offset++],size=read(),end=offset+size
    if(end>bytes.length)throw new Error('Invalid Python WASM module')
    if(section===5){
      if(read()!==1||read()!==1)throw new Error('Unsupported Python WASM memory declaration')
      const initial=read(),start=offset,maximum=read(),width=offset-start
      if(initial>4096||maximum!==65536||width!==3)throw new Error('Unsupported Python WASM memory limit')
      // 4096 pages = 256 MiB. Preserve the LEB width, so all section offsets stay valid.
      bytes.set([0x80,0xa0,0x00],start);return bytes
    }
    offset=end
  }
  throw new Error('Python WASM memory declaration is missing')
}
/** This function is stringified into a disposable module worker. Keep it self-contained. */
export async function runPythonWorker(request:any,limitMemory:(bytes:Uint8Array)=>Uint8Array){
  const {id,code,files,assets,packages,lock}=request
  let stdout=''
  const append=(text:string)=>{stdout+=(stdout?'\n':'')+text;if(stdout.length>64000)throw new Error('Python output exceeds the size limit')}
  const bytes64=(bytes:Uint8Array)=>{let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)}
  const safe=(path:string)=>{if(!path||path.length>240||/[\\:%\u0000-\u001f]/.test(path)||path.startsWith('/')||path.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('Invalid session file path');return path}
  try{
    const base='https://chatbox-runtime.invalid/'
    // Package loading is local too. The browser CSP independently blocks every network connection.
    globalThis.fetch=(async(input:any)=>{
      const url=new URL(typeof input==='string'?input:input.url,base)
      if(url.origin!==new URL(base).origin||url.search)throw new Error('Python network access is disabled')
      const name=decodeURIComponent(url.pathname.slice(1)),bytes=assets[name]
      if(!bytes)throw new Error('Python package is not installed: '+name)
      return new Response(name==='pyodide.asm.wasm'?limitMemory(bytes):bytes,{headers:{'content-type':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'}})
    }) as typeof fetch
    const moduleURL=(name:string)=>'data:text/javascript;base64,'+bytes64(assets[name])
    const {loadPyodide}=await import(/* @vite-ignore */ moduleURL('pyodide.mjs'))
    const {default:createPyodideModule}=await import(/* @vite-ignore */ moduleURL('pyodide.asm.mjs'))
    const py=await loadPyodide({indexURL:base,packageBaseUrl:base,lockFileContents:lock,createPyodideModule,jsglobals:Object.create(null),stdout:append,stderr:append,stdin:()=>null,env:{HOME:'/workspace',MPLBACKEND:'Agg'}})
    if(packages.length)await py.loadPackage(packages)
    py.FS.mkdirTree('/workspace')
    for(const [path,file]of Object.entries(files) as [string,{base64:string}][]){safe(path);const target='/workspace/'+path;py.FS.mkdirTree(target.slice(0,target.lastIndexOf('/')));py.FS.writeFile(target,Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0)))}
    py.FS.chdir('/workspace')
    const result=await py.runPythonAsync(code);if(result?.destroy)result.destroy()
    const output:Record<string,{base64:string}>=Object.create(null);let count=0,total=0
    const walk=(folder:string,depth:number)=>{
      if(depth>12)throw new Error('Python output folders exceed the depth limit')
      for(const name of py.FS.readdir('/workspace'+(folder?'/'+folder:''))){
        if(name==='.'||name==='..')continue
        const path=safe(folder?folder+'/'+name:name),stat=py.FS.lstat('/workspace/'+path)
        if(py.FS.isLink(stat.mode))throw new Error('Symbolic links are not session files')
        if(py.FS.isDir(stat.mode)){walk(path,depth+1);continue}
        if(!py.FS.isFile(stat.mode))throw new Error('Unsupported Python output file')
        count++;total+=stat.size;if(count>128||stat.size>10*1024*1024||total>20*1024*1024)throw new Error('Python output exceeds the size limit')
        const encoded=bytes64(py.FS.readFile('/workspace/'+path));if(files[path]?.base64!==encoded)output[path]={base64:encoded}
      }
    }
    walk('',0);return {id,result:{stdout,files:output}}
  }catch(error){return {id,result:{stdout,files:{},error:String((error as Error)?.message||error).slice(0,4000)}}}
}
export function buildPythonExecutionHtml(id:string,token:string){
  const source='self.onmessage=async event=>{const result=await ('+runPythonWorker.toString()+')(event.data,('+limitPythonMemory.toString()+'));self.postMessage(result)}'
  const encoded=JSON.stringify('data:text/javascript;charset=utf-8,'+encodeURIComponent(source)).replace(/</g,'\\u003c')
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' data:; worker-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><script>
let worker,finished=false;const send=result=>{if(finished)return;finished=true;worker?.terminate();parent.postMessage(JSON.stringify({channel:${JSON.stringify(PYTHON_MESSAGE_CHANNEL)},token:${JSON.stringify(token)},id:${JSON.stringify(id)},result}),'*')};
window.addEventListener('message',event=>{if(event.source!==parent||event.data?.token!==${JSON.stringify(token)}||event.data?.id!==${JSON.stringify(id)}||worker)return;try{worker=new Worker(${encoded},{type:'module'});worker.onmessage=event=>send(event.data.result);worker.onerror=()=>send({stdout:'',files:{},error:'Python worker failed'});worker.postMessage(event.data.request)}catch{send({stdout:'',files:{},error:'Python worker failed'})}});
parent.postMessage({channel:${JSON.stringify(PYTHON_MESSAGE_CHANNEL)},token:${JSON.stringify(token)},id:${JSON.stringify(id)},ready:true},'*');
</script>`
}
