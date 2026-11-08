import { tool,type ToolSet } from 'ai'
import { z } from 'zod'
import { executeSessionCode } from '@shared/session-workspace-execution'
import { sessionFiles } from './files'
import { sessionPythonExecution } from './python-execution'
import { pythonRuntimeStatus } from './python-cache'
export async function executeSessionPython(id:string,code:string,paths:string[],signal:AbortSignal){
  if(!(await sessionFiles.index(id)).pythonEnabled)throw new Error('Python is disabled for this chat')
  return executeSessionCode(sessionFiles,{execute:async(code,files,signal)=>{
    if(!(await sessionFiles.index(id)).pythonEnabled)throw new Error('Python is disabled for this chat')
    const result=await sessionPythonExecution.execute(code,files,signal)
    if(!(await sessionFiles.index(id)).pythonEnabled)throw new Error('Python is disabled for this chat')
    return result
  }},id,code,paths,signal)
}
export async function sessionPythonTool(id:string):Promise<ToolSet>{
  if(!(await sessionFiles.index(id)).pythonEnabled)return {}
  const status=await pythonRuntimeStatus();if(!status.ready)return {}
  return {session_python:tool({
    description:'Run Python 3.14 locally in an isolated WebAssembly worker. Only inputPaths from the encrypted session workspace enter the virtual /workspace filesystem. Use pathlib/open for files. No OS shell, app database, API keys, network or automatic package installation. Installed packages: '+(status.packages.join(', ')||'Python standard library only')+'. A fresh interpreter is discarded after every call. Deadline 60 seconds; WASM heap maximum 256 MiB; files 10 MiB each/20 MiB total. Only successful file changes persist. Call session_file deliver for final outputs. Package downloads and enabling Python require a human in workspace settings.',
    inputSchema:z.object({code:z.string().max(100000),inputPaths:z.array(z.string()).max(128).default([])}).strict(),
    execute:({code,inputPaths},options)=>executeSessionPython(id,code,inputPaths,options.abortSignal??new AbortController().signal),
  })}
}
