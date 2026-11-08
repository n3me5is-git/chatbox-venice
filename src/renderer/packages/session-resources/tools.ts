import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { isTextResource,resourceMime } from '@shared/session-resources'
import { executeSessionCode } from '@shared/session-workspace-execution'
import { QUICKJS_ENVIRONMENT, QUICKJS_FILES } from '@shared/mobile-work/execution-contract'
import { capacitorExecution } from '@/packages/mobile-work-mode/execution-service'
import { sessionFiles } from './files'
import { listSessionResources, readSessionResource } from './service'
import type { ImageToolResults } from '@/packages/model-calls/toolsets/view-image'
import { parseViewImageToolResult, VIEW_IMAGE_MAX_READ_BYTES, VIEW_IMAGE_MAX_SOURCE_DIMENSION, VIEW_IMAGE_MAX_SOURCE_PIXELS } from '@shared/tools/view-image'
import { VIEW_IMAGE_MAX_NORMALIZED_LENGTH } from '@shared/tools/view-image-batch'
import { readRasterImageBounds } from '@shared/image-dimensions'

export const sessionWorkspaceInstructions='Use session_file for the encrypted files shown in the session explorer. list discovers generated images and attachments; read opens text by its listed path, preview opens a listed image as real visual input, and import copies a resource by its id into a working file for editing. These paths are separate from legacy OS/Work paths. Never regenerate a paid image to recover it: list the saved resources and preview/import the existing result. Use session_js for local isolated JavaScript with explicitly selected input paths. Deliver only final user-facing outputs using session_file action deliver. Working scripts stay out of the library. Never claim a file was created unless the tool succeeded.'
export async function buildSessionWorkspaceTools(id:string,imageResults?:ImageToolResults):Promise<ToolSet>{
  if((await sessionFiles.index(id)).toolsEnabled===false)return {}
  return {
    ...await (await import('./python-tools')).sessionPythonTool(id),
    session_file:tool({
      description:'Manage this chat’s encrypted file workspace. list includes chat attachments and generated media without reading bytes. preview returns a listed image as real visual input for a vision model; read/search return bounded UTF-8 text. import copies an existing resource into a working file for editing. write creates/updates UTF-8 text. delete removes one managed file permanently. deliver explicitly includes a final file in the library; intermediate files stay in the explorer. Paths are relative to this session; no OS paths or network.',
      inputSchema:z.object({action:z.enum(['list','read','preview','write','search','import','delete','deliver']),path:z.string().optional(),content:z.string().max(100000).optional(),query:z.string().max(200).optional(),resourceId:z.string().optional(),offset:z.number().int().min(0).optional()}).strict(),
      execute:async(input,options)=>{
        options.abortSignal?.throwIfAborted()
        if((await sessionFiles.index(id)).toolsEnabled===false)throw new Error('Session workspace tools are disabled')
        if(input.action==='list'){const result=await listSessionResources(id,options.abortSignal);return {files:result.items.map(({id,path,mime,bytes,origin,deliverable})=>({id,path,mime,bytes,origin,deliverable})),truncated:result.truncated}}
        if(!input.path)throw new Error('A relative session file path is required')
        if(input.action==='write'){if(input.content===undefined)throw new Error('File content is required');if(!isTextResource({name:input.path,mime:resourceMime(input.path)}))throw new Error('Use import to copy existing images or media. write accepts UTF-8 text only; do not save base64 as an image.');return sessionFiles.write(id,input.path,new TextEncoder().encode(input.content))}
        if(input.action==='import'){
          const resource=(await listSessionResources(id,options.abortSignal)).items.find(item=>item.id===input.resourceId)
          if(!resource)throw new Error('Session file not found')
          const {bytes}=await readSessionResource(id,resource)
          try{options.abortSignal?.throwIfAborted();return await sessionFiles.write(id,input.path,bytes,{mime:resource.mime})}finally{bytes.fill(0)}
        }
        const file=(input.action==='read'||input.action==='search'||input.action==='preview'?(await listSessionResources(id,options.abortSignal)).items:await sessionFiles.list(id)).find(file=>file.path===input.path)
        if(!file)throw new Error('Session file not found')
        if(input.action==='preview'){
          if(!imageResults)throw new Error('Select a vision-capable chat model to view images. The saved file remains in the explorer.')
          if(!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.mime))throw new Error('Image preview supports PNG, JPEG, WebP, GIF and BMP')
          imageResults.reserve(options.messages)
          const {bytes}=await readSessionResource(id,file)
          try{
            if(bytes.length>VIEW_IMAGE_MAX_READ_BYTES)throw new Error('Image is too large for model preview')
            const bounds=readRasterImageBounds(bytes)
            if(!bounds||bounds.maxWidth>VIEW_IMAGE_MAX_SOURCE_DIMENSION||bounds.maxHeight>VIEW_IMAGE_MAX_SOURCE_DIMENSION||bounds.maxPixels>VIEW_IMAGE_MAX_SOURCE_PIXELS)throw new Error('Image dimensions exceed the model preview limit')
            const {getImageBase64AndResize}=await import('@/packages/pic_utils')
            const dataUrl=await getImageBase64AndResize(new File([Uint8Array.from(bytes)],file.name,{type:file.mime}),{outputType:'image/webp',quality:0.85})
            options.abortSignal?.throwIfAborted()
            if(dataUrl.length>VIEW_IMAGE_MAX_NORMALIZED_LENGTH)throw new Error('Normalized image exceeds the request image limit')
            await sessionFiles.index(id);options.abortSignal?.throwIfAborted()
            return await imageResults.record({toolCallId:options.toolCallId,label:file.path,dataUrl,storeImage:async value=>{
              const normalized=Uint8Array.from(atob(value.slice(value.indexOf(',')+1)),character=>character.charCodeAt(0))
              try{options.abortSignal?.throwIfAborted();return (await sessionFiles.write(id,'previews/'+crypto.randomUUID()+'.webp',normalized,{mime:'image/webp'})).key}finally{normalized.fill(0)}
            }})
          }finally{bytes.fill(0)}
        }
        if(input.action==='delete'){await sessionFiles.remove(id,file.id);return {deleted:file.path}}
        if(input.action==='deliver'){await sessionFiles.deliver(id,file.path);return {path:file.path,deliverable:true,message:'Available in the session explorer and local library.'}}
        if(!isTextResource(file))throw new Error('This operation requires a text file')
        const {bytes}=await readSessionResource(id,file)
        try{
          const text=new TextDecoder().decode(bytes),offset=input.offset??0
          if(input.action==='read')return {path:file.path,content:text.slice(offset,offset+20000),nextOffset:offset+20000<text.length?offset+20000:null}
          if(!input.query)throw new Error('Search text is required')
          const matches=text.split('\n').flatMap((line,n)=>line.toLowerCase().includes(input.query!.toLowerCase())?[{line:n+1,text:line.slice(0,1000)}]:[])
          return {matches:matches.slice(0,50),truncated:matches.length>50}
        }finally{bytes.fill(0)}
      },
      toModelOutput:async options=>parseViewImageToolResult(options.output)&&imageResults?imageResults.toModelOutput(options):{type:'text' as const,value:JSON.stringify(options.output)??String(options.output)},
    }),
    session_js:tool({
      description:QUICKJS_ENVIRONMENT+'\n'+QUICKJS_FILES+'\nThis tool uses the encrypted session explorer workspace. Only inputPaths are readable. Successful output changes appear in its file tree; they are not library deliverables until explicitly delivered. A fresh runtime is discarded after every call.',
      inputSchema:z.object({code:z.string().max(100000),inputPaths:z.array(z.string()).max(128).default([])}).strict(),
      execute:({code,inputPaths},options)=>executeSessionCode(sessionFiles,capacitorExecution,id,code,inputPaths,options.abortSignal??new AbortController().signal),
    }),
  }
}
