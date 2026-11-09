export type PromptMentionKind='agent'|'file'|'chat'|'tool'
export interface PromptMention {id:string;kind:PromptMentionKind;name:string;description?:string;insert:string}
export function promptMentionQuery(value:string,cursor:number){
  const before=value.slice(0,cursor),match=/(?:^|[\s(])@([^\s@\[\]()]{0,100})$/.exec(before)
  return match?{start:cursor-match[1].length-1,end:cursor,query:match[1]}:null
}
export function insertPromptMention(value:string,range:{start:number;end:number},insert:string){return {value:value.slice(0,range.start)+insert+' '+value.slice(range.end),cursor:range.start+insert.length+1}}
export function mentionedChatIds(text:string){return [...new Set([...text.matchAll(/\[@[^\]\n]{1,240}\]\(chatbox:chat\/([a-zA-Z0-9_-]{1,100})\)/g)].map(match=>match[1]))].slice(0,8)}
export function mentionLink(name:string,url:string){return '[@'+name.replace(/[\[\]\n]/g,' ').slice(0,180)+']('+url+')'}
export function filterPromptMentions(items:PromptMention[],query:string){const search=query.toLowerCase();return items.filter(item=>(item.name+' '+(item.description||'')+' '+item.kind).toLowerCase().includes(search)).slice(0,40)}
