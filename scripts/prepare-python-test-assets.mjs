import { build } from 'esbuild'
import { mkdir,writeFile,readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
const bundle=await build({entryPoints:['src/shared/python-runtime.ts'],bundle:true,write:false,platform:'node',format:'esm'})
const {PYTHON_CORE_ASSETS,PYTHON_RUNTIME_ORIGIN,pythonPackagePlan}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const directory=path.resolve('test-results/python-assets');await mkdir(directory,{recursive:true})
async function asset(name,expected){
  const file=path.join(directory,name)
  const valid=bytes=>(expected.bytes===undefined||bytes.length===expected.bytes)&&createHash('sha256').update(bytes).digest('hex')===expected.sha256
  try{const bytes=await readFile(file);if(valid(bytes))return bytes}catch{}
  const response=await fetch(PYTHON_RUNTIME_ORIGIN+name);if(!response.ok)throw Error('Python test asset download failed: '+name)
  const bytes=Buffer.from(await response.arrayBuffer());if(!valid(bytes))throw Error('Python test asset integrity mismatch: '+name)
  await writeFile(file,bytes);return bytes
}
for(const [name,expected]of Object.entries(PYTHON_CORE_ASSETS))await asset(name,expected)
const lock=JSON.parse(await readFile(path.join(directory,'pyodide-lock.json'),'utf8'))
for(const item of pythonPackagePlan(lock,['numpy']))await asset(item.file_name,{sha256:item.sha256})
console.log('Verified optional Python core and NumPy test assets. No application credentials were used.')
