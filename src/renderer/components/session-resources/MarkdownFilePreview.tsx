import { createElement, useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { Button, Checkbox, Stack, Text } from '@mantine/core'
import { LocalMermaid } from './LocalMermaid'
import { forkT as ft } from '@/i18n/fork'
import { relativeResourcePath } from '@shared/session-resources'
import 'katex/dist/katex.min.css'
import './markdown-file.css'

interface Props { source:string; path:string; resolveImage:(path:string)=>Promise<string|undefined>; openFile:(path:string)=>void; openExternal:(url:string)=>void }
function LocalImage({src,alt,allowed,path,resolve}:{src?:string;alt?:string;allowed:boolean;path:string;resolve:Props['resolveImage']}){
  const [url,setUrl]=useState<string>(),[failed,setFailed]=useState(false)
  const external=/^https?:/i.test(src||'')
  useEffect(()=>{
    setUrl(undefined);setFailed(false);let active=true,owned:string|undefined
    if(external){if(allowed)setUrl(src);return}
    if(/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src||'')){setUrl(src);return}
    const target=relativeResourcePath(path,src||'')
    if(target)void resolve(target).then(value=>{if(!active){if(value?.startsWith('blob:'))URL.revokeObjectURL(value);return}owned=value;setUrl(value);setFailed(!value)}).catch(()=>active&&setFailed(true))
    else setFailed(true)
    return()=>{active=false;if(owned?.startsWith('blob:'))URL.revokeObjectURL(owned)}
  },[src,path,resolve,allowed,external])
  return url?<img src={url} alt={alt||''} loading="lazy" referrerPolicy="no-referrer" style={{maxWidth:'100%',height:'auto'}}/>:<Text component="span" size="sm" c="dimmed">{alt||ft('Image')} — {external&&!allowed?ft('External image blocked'):failed?ft('Image unavailable'):ft('Loading image')}</Text>
}
export function MarkdownFilePreview({source,path,resolveImage,openFile,openExternal}:Props){
  const [external,setExternal]=useState(false)
  useEffect(()=>setExternal(false),[path])
  const headings=useMemo(()=>{
    const tree=unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(source),items:{id:string;title:string;level:number}[]=[]
    const text=(node:any):string=>typeof node.value==='string'?node.value:(node.children??[]).map(text).join('')
    visit(tree,'heading',(node:any)=>{items.push({id:'section-'+node.position.start.line,title:text(node),level:node.depth})})
    return items
  },[source])
  const heading=(tag:'h1'|'h2'|'h3'|'h4'|'h5'|'h6')=>({node,...props}:any)=>createElement(tag,{...props,id:'section-'+node.position.start.line})
  return <Stack data-markdown-file gap="sm" style={{minWidth:0}}>
    {/!\[[^\]]*\]\(https?:/i.test(source)&&<Checkbox label={ft('Load external images')} description={ft('External images contact their hosting servers. Local images stay on this device.')} checked={external} onChange={event=>setExternal(event.currentTarget.checked)}/>}
    {headings.length>1&&<details><summary>{ft('Table of contents')}</summary><Stack gap={2} mt="xs">{headings.map(item=><Button key={item.id} variant="subtle" size="compact-sm" justify="start" style={{marginLeft:(item.level-1)*10,whiteSpace:'normal',height:'auto'}} onClick={event=>{const root=event.currentTarget.closest('[data-markdown-file]');root?.querySelector('#'+item.id)?.scrollIntoView({block:'start',behavior:'smooth'})}}>{item.title}</Button>)}</Stack></details>}
    <article className="session-markdown-file" style={{minWidth:0,overflowWrap:'anywhere'}}>
      <ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false,trust:false}]]} skipHtml urlTransform={(url,key)=>key==='src'&&/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(url)?url:defaultUrlTransform(url)} components={{
        h1:heading('h1'),h2:heading('h2'),h3:heading('h3'),h4:heading('h4'),h5:heading('h5'),h6:heading('h6'),
        img:({src,alt})=><LocalImage src={src} alt={alt} allowed={external} path={path} resolve={resolveImage}/>,
        a:({href,children})=><a href={href} rel="noreferrer" onClick={event=>{event.preventDefault();if(href?.startsWith('#')){event.currentTarget.closest('[data-markdown-file]')?.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(node=>{if(node.id===href.slice(1)||node.textContent?.toLowerCase().replace(/\s+/g,'-')===href.slice(1))node.scrollIntoView({block:'start'})});return}const target=relativeResourcePath(path,href||'');if(target)openFile(target);else if(/^https?:\/\//i.test(href||''))openExternal(href!)}}>{children}</a>,
        code:({className,children})=>className==='language-mermaid'?<span style={{display:'block',maxWidth:'100%',overflow:'auto'}}><LocalMermaid source={String(children).trim()}/></span>:<code className={className}>{children}</code>,
        pre:({children})=><pre style={{maxWidth:'100%',overflow:'auto',padding:12,background:'var(--chatbox-background-secondary)'}}>{children}</pre>,
        table:({children})=><div style={{maxWidth:'100%',overflowX:'auto'}}><table>{children}</table></div>,
      }}>{source}</ReactMarkdown>
    </article>
  </Stack>
}
