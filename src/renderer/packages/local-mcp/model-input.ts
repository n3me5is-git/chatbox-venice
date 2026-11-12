import {z} from 'zod'
import type {JSONValue,ModelMessage,ToolSet} from 'ai'
import {validatedToolSchema} from '@shared/validated-tool-schema'
const identity=z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
export const externalMessagesSchema=z.array(z.union([
  z.object({role:z.enum(['system','user','assistant']),content:z.string().max(64000)}).strict(),
  z.object({role:z.literal('assistant'),content:z.string().max(64000).default(''),toolCalls:z.array(z.object({toolCallId:identity,toolName:identity,input:z.record(z.string(),z.unknown())}).strict()).min(1).max(16)}).strict(),
  z.object({role:z.literal('tool'),toolCallId:identity,toolName:identity,result:z.unknown()}).strict(),
])).min(1).max(50)
export const externalToolsSchema=z.array(z.object({name:identity,description:z.string().max(8000).optional(),inputSchema:z.object({type:z.literal('object')}).passthrough()}).strict()).max(32).optional()
export function externalModelInput(messages:z.infer<typeof externalMessagesSchema>,definitions:z.infer<typeof externalToolsSchema>){
  const tools:ToolSet={},seen=new Set<string>()
  for(const definition of definitions||[]){if(seen.has(definition.name))throw Error('External tool names must be unique');seen.add(definition.name);tools[definition.name]={description:definition.description,inputSchema:validatedToolSchema(definition.inputSchema)}}
  const modelMessages:ModelMessage[]=messages.map(message=>{
    if(message.role==='tool')return {role:'tool',content:[{type:'tool-result',toolCallId:message.toolCallId,toolName:message.toolName,output:typeof message.result==='string'?{type:'text',value:message.result}:{type:'json',value:message.result as JSONValue}}]}
    if('toolCalls'in message)return {role:'assistant',content:[...(message.content?[{type:'text' as const,text:message.content}]:[]),...message.toolCalls.map(call=>({type:'tool-call' as const,toolCallId:call.toolCallId,toolName:call.toolName,input:call.input}))]}
    return {role:message.role,content:message.content}
  })
  return {messages:modelMessages,tools}
}
