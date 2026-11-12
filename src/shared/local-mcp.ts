import { z } from 'zod'
export const LocalMCPPermissionsSchema=z.object({readFiles:z.boolean(),writeFiles:z.boolean(),execute:z.boolean(),models:z.boolean(),automaticModels:z.boolean(),venice:z.boolean(),search:z.boolean(),forwardMCP:z.boolean(),multiAgent:z.boolean().default(false)}).strict()
export const LocalMCPApplicationSchema=z.object({mode:z.enum(['full','shadow','router']),name:z.string().trim().min(1).max(80),externalTools:z.boolean().default(false),automaticStudio:z.boolean().default(false),manageChats:z.boolean().default(false),conversations:z.boolean().default(false),providers:z.array(z.string().min(1).max(128)).max(100).optional(),privacy:z.enum(['auto','e2ee','tee']).default('auto'),dedicatedIds:z.array(z.string().min(1).max(100)).max(100).default([])}).strict()
export type LocalMCPApplication=z.infer<typeof LocalMCPApplicationSchema>
export const LocalMCPStartSchema=z.object({sessionId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),port:z.number().int().refine(port=>port===0||port>=1024&&port<=65535),permissions:LocalMCPPermissionsSchema,endpointId:z.string().uuid().optional(),application:LocalMCPApplicationSchema.optional()}).strict()
export type LocalMCPPermissions=z.infer<typeof LocalMCPPermissionsSchema>
export type LocalMCPStart=z.infer<typeof LocalMCPStartSchema>
export const defaultLocalMCPPermissions:LocalMCPPermissions={readFiles:true,writeFiles:false,execute:false,models:false,automaticModels:false,venice:false,search:false,forwardMCP:false,multiAgent:false}
export type LocalMCPState={running:false}|{running:true;sessionId:string;url:string;token:string;permissions:LocalMCPPermissions;startedAt:number;endpointId?:string;application?:LocalMCPApplication}
export type LocalMCPGrant=Extract<LocalMCPState,{running:true}>
export type LocalMCPRequest={id:string;operation:'list_tools'|'call_tool'|'list_resources'|'read_resource'|'cancel'|'revoke';grant:LocalMCPGrant;name?:string;arguments?:Record<string,unknown>;uri?:string;callId?:string}
export type LocalMCPTool={name:string;description?:string;inputSchema:{type:'object';[key:string]:unknown}}
export function localMCPAllows(permissions:LocalMCPPermissions,name:string,args:Record<string,unknown>={}){
  if(['agent_catalog','agent_tree','agent_spawn','agent_status','agent_message','agent_wait','agent_result','agent_files','agent_file','agent_stop'].includes(name))return permissions.multiAgent&&(name!=='agent_files'||permissions.readFiles)&&(name!=='agent_file'||permissions.readFiles&&permissions.writeFiles)
  if(['session_rag_search','session_rag_read'].includes(name))return permissions.readFiles&&permissions.search
  if(name==='session_file')return ['list','read','search','preview'].includes(String(args.action))?permissions.readFiles:permissions.writeFiles&&(['write','delete','deliver'].includes(String(args.action))||args.action==='import'&&permissions.readFiles)
  if(name==='session_js'||name==='session_python')return permissions.execute&&permissions.readFiles&&permissions.writeFiles
  if(name==='app_models'||name==='app_model')return permissions.models
  if(name==='venice_image'||name==='venice_media')return permissions.venice
  if(/^web_search(?:_(brave|google|exa))?$/.test(name)||name==='parse_link')return permissions.search
  return name.startsWith('mcp_')&&permissions.forwardMCP
}
export function localMCPWorkerAllows(permissions:LocalMCPPermissions,available:ReadonlySet<string>,name:string,input:Record<string,unknown>={}){
  if(!permissions.multiAgent)return false
  if(name==='ask_user')return true
  if(name.startsWith('agent_'))return localMCPAllows(permissions,name,input)
  if(available.has(name))return localMCPAllows(permissions,name,input)
  return available.has('mcp_'+name)&&localMCPAllows(permissions,'mcp_'+name,input)
}
export function sessionResourceURI(sessionId:string,resourceId:string){return 'chatbox-session://'+encodeURIComponent(sessionId)+'/'+encodeURIComponent(resourceId)}
export function parseSessionResourceURI(sessionId:string,uri:string){const prefix='chatbox-session://'+encodeURIComponent(sessionId)+'/';if(!uri.startsWith(prefix))throw new Error('Resource does not belong to the shared chat');return decodeURIComponent(uri.slice(prefix.length))}

/** Check both endpoint scope and feature grant before dispatching a client operation. */
export function localMCPGrantAllows(grant:LocalMCPGrant,name:string,args:Record<string,unknown>={}){
  const app=grant.application
  if(!app)return localMCPAllows(grant.permissions,name,args)
  if(name==='app_contexts')return app.mode!=='router'
  if(name==='app_conversation')return app.mode!=='router'&&app.conversations&&(args.action!=='send'||grant.permissions.models)
  if(name==='app_resources')return grant.permissions.readFiles
  if(name==='app_upload')return grant.permissions.writeFiles
  if(name==='venice_studio')return grant.permissions.venice
  if(name==='app_context_tools'||name==='app_call')return app.mode!=='router'
  if(name==='app_cleanup')return true
  if(app.mode==='router')return ['app_models','app_model','venice_image','venice_media'].includes(name)&&localMCPAllows(grant.permissions,name,args)
  return false
}

/** Portable, distinct client keys even when two endpoints use the same display name. */
export function localMCPClientConfiguration(grant:LocalMCPGrant){
  const name=(grant.application?.name||'chatbox-venice').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').slice(0,40)
  return {mcpServers:{['chatbox-'+name+'-'+new URL(grant.url).port]:{url:grant.url,headers:{Authorization:'Bearer '+grant.token}}}}
}

/** Status/catalog/read requests must remain fresh when a client repeats its request ID. */
export function localMCPObservation(name:string,args:Record<string,unknown>={}){
  if(['app_models','agent_catalog','agent_tree','agent_status','agent_wait','agent_result','agent_files'].includes(name))return true
  const actions:Record<string,string[]>={session_file:['list','read','search','preview'],venice_image:['models','status'],venice_media:['catalog','list','quote','status','show','wait'],venice_studio:['catalog','quote','status','wait','voices']}
  return actions[name]?.includes(String(args.action))===true
}
