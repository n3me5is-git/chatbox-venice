import type { Message } from '@shared/types'
import type { SharedSnapshot } from '@shared/collaboration'
export function sharedMessage(id:string,message:Message,files:string[],archived:boolean):SharedSnapshot['messages'][number]{
  return {id,role:message.role as 'user'|'assistant'|'system',text:message.contentParts.flatMap(part=>part.type==='text'?[part.text]:[]).join('\n').slice(0,200000),
    ...(message.collaborationAuthor?{author:message.collaborationAuthor}:message.role==='user'?{author:{id:'owner',name:'Owner'}}:{}),...(files.length?{files:[...new Set(files)].slice(0,100)}:{}),archived,generating:!!message.generating,
    ...(message.error?{error:String(message.error).slice(0,4000)}:{}),reasoning:message.contentParts.flatMap(part=>part.type==='reasoning'&&!part.protocolOnly?[part.text]:[]).join('\n').slice(0,100000),
    tools:message.contentParts.flatMap(part=>part.type==='tool-call'?[{id:part.toolCallId.slice(0,240),name:part.toolName.slice(0,240),state:part.state==='result'?'completed' as const:part.state==='error'?'failed' as const:'running' as const,detail:JSON.stringify({args:part.args,result:part.result}).slice(0,20000)}]:[]).slice(0,100)}
}
/** Keep tool/reasoning additions within the existing fragmented transport budget. */
export function boundSharedSnapshot(snapshot:SharedSnapshot):SharedSnapshot{
  const result={...snapshot,messages:[] as SharedSnapshot['messages']};let size=JSON.stringify(result).length
  for(let index=snapshot.messages.length-1;index>=0;index--){const message=snapshot.messages[index],bytes=JSON.stringify(message).length+1;if(size+bytes>6000000){result.truncated=true;break}result.messages.push(message);size+=bytes}
  result.messages.reverse();return result
}
