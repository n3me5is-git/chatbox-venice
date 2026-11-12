import {settingsStore} from '@/stores/settingsStore'
import {buildContext} from '@shared/context'
import {currentBlobStorage} from '@/adapters/CurrentBlobStorage'
import {vaultRuntimeFor} from '@/packages/vault/runtime'
import platform from '@/platform'
import {latestSnapshotWriter} from '@shared/agent-output'
import {tool,type ToolSet} from 'ai'
import {z} from 'zod'
import {withSessionGenerationLock} from '@chatbox/core/generation'
import {createMessage} from '@shared/types'
import type {LocalMCPGrant} from '@shared/local-mcp'
import {localMCPAllows} from '@shared/local-mcp'
import {validatedToolSchema} from '@shared/validated-tool-schema'
import {createModel} from '@/adapters'
import {rendererApplication} from '@/app/renderer-application'
import {convertToModelMessages} from '@/packages/model-calls/message-utils'
import {localMCPModelCatalog,localMCPSettings,localMCPTools,handleSessionLocalMCP} from './backend'
import {requestExternalModelApproval} from './model-approval'
export function applicationConversationTool(grant:LocalMCPGrant,signal:AbortSignal,assert:(id:string)=>Promise<unknown>,unique:(id:string,input:unknown,work:()=>Promise<unknown>)=>Promise<unknown>){
  return tool({description:'Read a bounded page of an authorized root conversation, or send an explicit user message and generate a reply with only this endpoint’s granted tools. Conversation access is required; sending also requires paid-model permission. Messages and results stay in that context until deleted. No automatic retries. Work chat model/agent configuration remains explicit.',inputSchema:z.object({action:z.enum(['read','send']),sessionId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),text:z.string().min(1).max(64000).optional(),request_id:z.string().min(1).max(128).optional(),limit:z.number().int().min(1).max(50).default(20),maxSteps:z.number().int().min(1).max(30).default(8)}).strict(),execute:async input=>{
    await assert(input.sessionId)
    if(input.action==='read'){
      const page=await rendererApplication.sessions.readSessionTranscriptWindow({sessionId:input.sessionId,origin:'tail',limit:input.limit,maxBytes:256*1024})
      return {messages:page?.messages.map(row=>row.message)||[],hasOlder:!!page?.older}
    }
    if(!input.text||!input.request_id)throw Error('Sending requires text and a stable request_id')
    return unique('conversation:'+input.request_id,input,()=>withSessionGenerationLock(input.sessionId,async()=>{
      await assert(input.sessionId)
      const scoped={...grant,sessionId:input.sessionId},settings=await localMCPSettings(scoped),configuration=settingsStore.getState().getSettings().providers?.[settings.provider||'']
      if(!(await localMCPModelCatalog(scoped)).some(model=>model.provider===settings.provider&&model.modelId===settings.modelId))throw Error('This chat model is not available to the endpoint')
      const contextSource=await rendererApplication.sessions.getSessionContextSource({sessionId:input.sessionId,maxContextMessageCount:51,reserveCurrentInput:true})
      if(!contextSource)throw Error('This chat is unavailable')
      if(contextSource.candidateMessages.length>50||JSON.stringify(contextSource.candidateMessages).length>1024*1024)throw Error('This conversation exceeds the external chat context limit. Compact it in the app or use a new workspace.')
      const history=contextSource.candidateMessages
      if(history.some(message=>message.generating))throw Error('Wait for this chat’s current generation to finish')
      if(!grant.permissions.automaticModels&&!await requestExternalModelApproval(scoped,{provider:settings.provider!,modelId:settings.modelId!,messages:[{role:'user',content:'Continue this authorized chat with its saved context and granted tools. New message:\n'+input.text}],maxOutputTokens:settings.maxTokens||4096},signal))throw Error('External model call was not approved')
      await assert(input.sessionId)
      const current=await rendererApplication.sessions.getSessionHeader(input.sessionId)
      if(!current||contextSource.revision!==null&&current.revision!==contextSource.revision||JSON.stringify(await localMCPSettings(scoped))!==JSON.stringify(settings)||settingsStore.getState().getSettings().providers?.[settings.provider||'']!==configuration)throw Error('The conversation or model configuration changed. Review a new request.')
      const lease=rendererApplication.generationRuntime.acquireGenerationPreparationLease(input.sessionId)
      if(!lease)throw Error('This chat is busy')
      const assistant={...createMessage('assistant',''),generating:true},user=createMessage('user','[MCP: '+grant.application!.name+']\n'+input.text)
      let inserted=false,last=0
      const writer=latestSnapshotWriter<NonNullable<typeof assistant.contentParts>>(contentParts=>rendererApplication.sessions.updateMessage(input.sessionId,assistant.id,current=>({...current!,contentParts})))
      try{
        const model=await createModel(settings),tools:ToolSet={}
        for(const member of await localMCPTools(scoped))if(localMCPAllows(grant.permissions,member.name,member.name==='session_file'?{action:grant.permissions.readFiles?'list':'write'}:{}))tools[member.name]={description:member.description,inputSchema:validatedToolSchema(member.inputSchema),execute:async(args,options)=>{await assert(input.sessionId);return handleSessionLocalMCP({id:crypto.randomUUID(),grant:scoped,operation:'call_tool',name:member.name,arguments:args as Record<string,unknown>,callId:options.toolCallId},signal)}}
        const access=vaultRuntimeFor(platform).projects
        const prepared=await buildContext([...history,user].map(message=>grant.permissions.readFiles?message:{...message,files:undefined}),{compactionPoints:contextSource.compactionPoints,maxContextMessageCount:settings.maxContextMessageCount,attachmentResolver:{read:async key=>{if(!grant.permissions.readFiles)return null;await assert(input.sessionId);await access.assertLibraryKey(key);const value=await currentBlobStorage.get(key);await assert(input.sessionId);return value}}})
        const messages=await convertToModelMessages(prepared,{modelSupportVision:grant.permissions.readFiles&&model.isSupportVision()})
        const {createWorkerContext}=await import('@/packages/multi-agent/worker-context'),context=await createWorkerContext(settings,tools,signal,async()=>{await assert(input.sessionId)})
        await rendererApplication.sessions.insertMessages(input.sessionId,[user,assistant]);inserted=true
        const result=await model.chat(messages,{sessionId:input.sessionId,signal,tools,maxSteps:input.maxSteps,agentMode:settings.agentMode?.value==='on',prepareStep:async step=>{await assert(input.sessionId);return {messages:await context.prepare([...step.initialMessages,...step.responseMessages])}},onRequestResolved:async()=>{await assert(input.sessionId)},onResultChange:async value=>{if(value.contentParts&&Date.now()-last>1000){last=Date.now();writer.push(structuredClone(value.contentParts))}}})
        await writer.flush();await assert(input.sessionId)
        await rendererApplication.sessions.updateMessage(input.sessionId,assistant.id,current=>({...current!,...result,generating:false,aiProvider:settings.provider,modelId:settings.modelId}))
        return {messageId:assistant.id,contentParts:result.contentParts,usage:result.usage,finishReason:result.finishReason}
      }catch(error){await writer.flush().catch(()=>{});if(inserted)await rendererApplication.sessions.updateMessage(input.sessionId,assistant.id,current=>({...current!,generating:false,error:'External MCP request stopped or failed. Inspect the saved messages before starting a new paid request.'})).catch(()=>{});throw error}
      finally{rendererApplication.generationRuntime.releaseGenerationPreparationLease(lease)}
    }))
  }})
}
