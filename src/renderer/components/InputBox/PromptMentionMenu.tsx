import { Loader,Stack,Text,UnstyledButton } from '@mantine/core'
import { IconFile,IconMessage,IconRobot,IconTool } from '@tabler/icons-react'
import { useEffect } from 'react'
import type { PromptMention } from '@shared/prompt-mentions'
import { forkT as ft } from '@/i18n/fork'
export type PromptMentionSource=(query:string,signal:AbortSignal)=>Promise<PromptMention[]>
export function PromptMentionMenu({id,items,selected,loading,error,pick}:{id:string;items:PromptMention[];selected:number;loading:boolean;error:string;pick:(item:PromptMention)=>void}){
  useEffect(()=>{document.getElementById(id+'-'+selected)?.scrollIntoView?.({block:'nearest'})},[id,selected])
  const icons={agent:IconRobot,file:IconFile,chat:IconMessage,tool:IconTool},labels={agent:'Agent',file:'File',chat:'Conversation',tool:'MCP tool'}
  return <div id={id} role="listbox" aria-label={ft('Mention suggestions')} onMouseDown={event=>event.preventDefault()} style={{position:'absolute',bottom:'100%',left:0,right:0,zIndex:450,maxHeight:'min(340px, 42dvh)',overflowY:'auto',overscrollBehavior:'contain',background:'var(--mantine-color-body)',border:'1px solid var(--mantine-color-default-border)',borderRadius:12,boxShadow:'0 4px 20px #0002',padding:6}}>
    {loading&&<Loader size="xs" m="xs"/>}{error&&<Text size="xs" c="red" p="xs">{error}</Text>}{!loading&&!error&&!items.length&&<Text size="sm" c="dimmed" p="xs">{ft('No matching references')}</Text>}
    {items.map((item,index)=>{const Icon=icons[item.kind];return <UnstyledButton id={id+'-'+index} role="option" aria-selected={index===selected} key={item.kind+':'+item.id} onClick={()=>pick(item)} style={{width:'100%',display:'flex',gap:8,padding:8,borderRadius:8,background:index===selected?'var(--mantine-color-default-hover)':undefined}}><Icon size={18} style={{flexShrink:0,marginTop:2}}/><Stack gap={1} style={{minWidth:0,flex:1}}><Text size="sm" truncate>{item.kind==='agent'||item.kind==='tool'?'@':''}{item.name}</Text><Text size="xs" c="dimmed" lineClamp={1}>{ft(labels[item.kind])}{item.description?' · '+item.description:''}</Text></Stack></UnstyledButton>})}
    <Text size="xs" c="dimmed" p="xs">{ft('References use the current chat permissions. Tagging a tool does not enable it.')}</Text>
  </div>
}
