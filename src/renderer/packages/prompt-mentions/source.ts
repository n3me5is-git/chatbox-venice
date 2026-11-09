import type { PromptMention } from '@shared/prompt-mentions'
import { filterPromptMentions,mentionLink } from '@shared/prompt-mentions'
import { rendererApplication } from '@/app/renderer-application'
import { listDedicatedAgents } from '@/packages/multi-agent/library'
import { listSessionResources } from '@/packages/session-resources/service'
import { mcpController } from '@/packages/mcp/controller'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import platform from '@/platform'

export async function loadPromptMentions(sessionId:string,work:boolean,query:string,signal:AbortSignal):Promise<PromptMention[]>{
  const items:PromptMention[]=[],vault=vaultRuntimeFor(platform),targetScope=await vault.projects.sessionScope(sessionId)
  signal.throwIfAborted()
  if(work){
    for(const agent of await listDedicatedAgents())items.push({kind:'agent',id:agent.id,name:agent.name,description:agent.title,insert:'@'+agent.name})
    for(const [name,tool]of Object.entries(mcpController.getAvailableTools()))items.push({kind:'tool',id:name,name,description:typeof tool.description==='string'?tool.description.slice(0,200):undefined,insert:'@tool:'+name})
  }
  if(sessionId!=='new'){
    await vault.projects.assertSession(sessionId)
    for(const file of (await listSessionResources(sessionId,signal)).items)items.push({kind:'file',id:file.id,name:file.name,description:file.path,insert:mentionLink(file.name,'sandbox:/mnt/data/'+file.path.split('/').map(encodeURIComponent).join('/'))})
  }
  let cursor=0
  for(let page=0;page<10;page++){
    signal.throwIfAborted();const result=await rendererApplication.sessions.listSessionsMetaPage(cursor,100)
    for(const chat of result.items){
      if(chat.id===sessionId||chat.hidden||!chat.name.toLowerCase().includes(query.toLowerCase()))continue
      try{await vault.projects.assertSession(chat.id);const sourceScope=await vault.projects.sessionScope(chat.id);if(sourceScope&&sourceScope!==targetScope)continue}catch{continue}
      items.push({kind:'chat',id:chat.id,name:chat.name,insert:mentionLink(chat.name,'chatbox:chat/'+chat.id)})
    }
    if(result.nextCursor===null||items.filter(item=>item.kind==='chat').length>=20)break
    cursor=result.nextCursor
  }
  signal.throwIfAborted();return filterPromptMentions(items,query)
}
