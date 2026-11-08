import { z } from 'zod'
export const LocalMCPPermissionsSchema=z.object({readFiles:z.boolean(),writeFiles:z.boolean(),execute:z.boolean(),models:z.boolean(),automaticModels:z.boolean(),venice:z.boolean(),search:z.boolean(),forwardMCP:z.boolean()}).strict()
export const LocalMCPStartSchema=z.object({sessionId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),port:z.number().int().refine(port=>port===0||port>=1024&&port<=65535),permissions:LocalMCPPermissionsSchema}).strict()
export type LocalMCPPermissions=z.infer<typeof LocalMCPPermissionsSchema>
export type LocalMCPStart=z.infer<typeof LocalMCPStartSchema>
export const defaultLocalMCPPermissions:LocalMCPPermissions={readFiles:true,writeFiles:false,execute:false,models:false,automaticModels:false,venice:false,search:false,forwardMCP:false}
export type LocalMCPState={running:false}|{running:true;sessionId:string;url:string;token:string;permissions:LocalMCPPermissions;startedAt:number}
export type LocalMCPGrant=Extract<LocalMCPState,{running:true}>
export type LocalMCPRequest={id:string;operation:'list_tools'|'call_tool'|'list_resources'|'read_resource'|'cancel';grant:LocalMCPGrant;name?:string;arguments?:Record<string,unknown>;uri?:string;callId?:string}
export type LocalMCPTool={name:string;description?:string;inputSchema:{type:'object';[key:string]:unknown}}
export function localMCPAllows(permissions:LocalMCPPermissions,name:string,args:Record<string,unknown>={}){
  if(name==='session_file')return ['list','read','search'].includes(String(args.action))?permissions.readFiles:permissions.writeFiles&&(['write','delete','deliver'].includes(String(args.action))||args.action==='import'&&permissions.readFiles)
  if(name==='session_js'||name==='session_python')return permissions.execute&&permissions.readFiles&&permissions.writeFiles
  if(name==='app_models'||name==='app_model')return permissions.models
  if(name==='venice_image'||name==='venice_media')return permissions.venice
  if(/^web_search(?:_(brave|google|exa))?$/.test(name)||name==='parse_link')return permissions.search
  return name.startsWith('mcp_')&&permissions.forwardMCP
}
export function sessionResourceURI(sessionId:string,resourceId:string){return 'chatbox-session://'+encodeURIComponent(sessionId)+'/'+encodeURIComponent(resourceId)}
export function parseSessionResourceURI(sessionId:string,uri:string){const prefix='chatbox-session://'+encodeURIComponent(sessionId)+'/';if(!uri.startsWith(prefix))throw new Error('Resource does not belong to the shared chat');return decodeURIComponent(uri.slice(prefix.length))}
