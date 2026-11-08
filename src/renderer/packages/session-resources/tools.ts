import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { isTextResource } from '@shared/session-resources'
import { executeSessionCode } from '@shared/session-workspace-execution'
import { QUICKJS_ENVIRONMENT, QUICKJS_FILES } from '@shared/mobile-work/execution-contract'
import { capacitorExecution } from '@/packages/mobile-work-mode/execution-service'
import { sessionFiles } from './files'
import { listSessionResources, readSessionResource } from './service'

export const sessionWorkspaceInstructions='Use session_file for the encrypted files shown in the session explorer. These are separate from legacy OS/Work paths: import a resource by its id first if needed. Use session_js for local isolated JavaScript with explicitly selected input paths. Deliver only final user-facing outputs using session_file action deliver. Working scripts stay out of the library. Never claim a file was created unless the tool succeeded.'
export async function buildSessionWorkspaceTools(id:string):Promise<ToolSet>{
  if((await sessionFiles.index(id)).toolsEnabled===false)return {}
  return {
    session_file:tool({
      description:'Manage this chat’s encrypted file workspace. list includes chat attachments and generated media without reading bytes. read/search return bounded UTF-8 text; import copies an existing resource into a working file. write creates/updates UTF-8 text. delete removes one managed file permanently. deliver explicitly includes a final file in the library; intermediate files stay in the explorer. Paths are relative to this session; no OS paths or network.',
      inputSchema:z.object({action:z.enum(['list','read','write','search','import','delete','deliver']),path:z.string().optional(),content:z.string().max(100000).optional(),query:z.string().max(200).optional(),resourceId:z.string().optional(),offset:z.number().int().min(0).optional()}).strict(),
      execute:async(input,options)=>{
        options.abortSignal?.throwIfAborted()
        if((await sessionFiles.index(id)).toolsEnabled===false)throw new Error('Session workspace tools are disabled')
        if(input.action==='list'){const result=await listSessionResources(id,options.abortSignal);return {files:result.items.map(({id,path,mime,bytes,origin,deliverable})=>({id,path,mime,bytes,origin,deliverable})),truncated:result.truncated}}
        if(!input.path)throw new Error('A relative session file path is required')
        if(input.action==='write'){if(input.content===undefined)throw new Error('File content is required');return sessionFiles.write(id,input.path,new TextEncoder().encode(input.content))}
        if(input.action==='import'){
          const resource=(await listSessionResources(id,options.abortSignal)).items.find(item=>item.id===input.resourceId)
          if(!resource)throw new Error('Session file not found')
          const {bytes}=await readSessionResource(id,resource)
          try{options.abortSignal?.throwIfAborted();return await sessionFiles.write(id,input.path,bytes,{mime:resource.mime})}finally{bytes.fill(0)}
        }
        const file=(await sessionFiles.list(id)).find(file=>file.path===input.path)
        if(!file)throw new Error('Session file not found')
        if(input.action==='delete'){await sessionFiles.remove(id,file.id);return {deleted:file.path}}
        if(input.action==='deliver'){await sessionFiles.deliver(id,file.path);return {path:file.path,deliverable:true,message:'Available in the session explorer and local library.'}}
        if(!isTextResource(file))throw new Error('This operation requires a text file')
        const {bytes}=await sessionFiles.read(id,file.path)
        try{
          const text=new TextDecoder().decode(bytes),offset=input.offset??0
          if(input.action==='read')return {path:file.path,content:text.slice(offset,offset+20000),nextOffset:offset+20000<text.length?offset+20000:null}
          if(!input.query)throw new Error('Search text is required')
          const matches=text.split('\n').flatMap((line,n)=>line.toLowerCase().includes(input.query!.toLowerCase())?[{line:n+1,text:line.slice(0,1000)}]:[])
          return {matches:matches.slice(0,50),truncated:matches.length>50}
        }finally{bytes.fill(0)}
      },
    }),
    session_js:tool({
      description:QUICKJS_ENVIRONMENT+'\n'+QUICKJS_FILES+'\nThis tool uses the encrypted session explorer workspace. Only inputPaths are readable. Successful output changes appear in its file tree; they are not library deliverables until explicitly delivered. A fresh runtime is discarded after every call.',
      inputSchema:z.object({code:z.string().max(100000),inputPaths:z.array(z.string()).max(128).default([])}).strict(),
      execute:({code,inputPaths},options)=>executeSessionCode(sessionFiles,capacitorExecution,id,code,inputPaths,options.abortSignal??new AbortController().signal),
    }),
  }
}
