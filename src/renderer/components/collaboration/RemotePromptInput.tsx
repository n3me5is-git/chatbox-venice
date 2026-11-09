import { useEffect,useId,useRef,useState } from 'react'
import { Textarea } from '@mantine/core'
import { filterPromptMentions,insertPromptMention,mentionLink,promptMentionQuery,type PromptMention } from '@shared/prompt-mentions'
import type { GuestShare } from '@/packages/collaboration/hub'
import { PromptMentionMenu } from '@/components/InputBox/PromptMentionMenu'
import { forkT as ft } from '@/i18n/fork'
export function RemotePromptInput({room,value,change,submit}:{room:GuestShare;value:string;change:(value:string)=>void;submit:()=>void}){
  const [mention,setMention]=useState<ReturnType<typeof promptMentionQuery>>(null),[selected,setSelected]=useState(0),input=useRef<HTMLTextAreaElement>(null),id=useId()
  const items=mention?filterPromptMentions([...(room.snapshot?.mentions||[]),...(room.snapshot?.files||[]).map(file=>({id:file.id,kind:'file' as const,name:file.name,description:file.path,insert:mentionLink(file.name,'sandbox:/mnt/data/'+file.path.split('/').map(encodeURIComponent).join('/'))}))],mention.query):[]
  useEffect(()=>setSelected(0),[mention?.query])
  const pick=(item:PromptMention)=>{if(!mention)return;const next=insertPromptMention(value,mention,item.insert);change(next.value);setMention(null);requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(next.cursor,next.cursor)})}
  return <div style={{position:'relative',minWidth:0}}>{mention&&<PromptMentionMenu id={id} items={items} selected={Math.min(selected,Math.max(0,items.length-1))} loading={false} error="" pick={pick}/>}<Textarea ref={input} label={ft('Message')} aria-label={ft('Message')} placeholder={ft('Write to the shared conversation…')} value={value} maxLength={100000} autosize minRows={2} maxRows={6} disabled={room.status!=='connected'} onChange={event=>{change(event.currentTarget.value);setMention(('isComposing'in event.nativeEvent&&event.nativeEvent.isComposing)?null:promptMentionQuery(event.currentTarget.value,event.currentTarget.selectionStart))}} onSelect={event=>setMention(promptMentionQuery(event.currentTarget.value,event.currentTarget.selectionStart))} onBlur={()=>setMention(null)} onKeyDown={event=>{
    if(event.nativeEvent.isComposing)return
    if(mention){if(event.key==='Escape'){event.preventDefault();setMention(null);return}if(items.length&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();setSelected(index=>(index+(event.key==='ArrowDown'?1:items.length-1))%items.length);return}if(items.length&&(event.key==='Enter'||event.key==='Tab')){event.preventDefault();pick(items[selected%items.length]);return}}
    if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();submit()}
  }}/></div>
}
