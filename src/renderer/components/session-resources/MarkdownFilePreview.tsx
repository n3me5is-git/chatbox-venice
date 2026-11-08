import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { Alert,Button, Checkbox, Group,Stack, Text } from '@mantine/core'
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
  return url?<img src={url} alt={alt||''} loading="lazy" referrerPolicy="no-referrer" style={{maxWidth:'100%',height:'auto'}}/>:<Text component="span" data-export-pending={!failed&&(!external||allowed)?'true':undefined} size="sm" c="dimmed">{alt||ft('Image')} — {external&&!allowed?ft('External image blocked'):failed?ft('Image unavailable'):ft('Loading image')}</Text>
}
export function MarkdownFilePreview({source,path,resolveImage,openFile,openExternal}:Props){
  const [external,setExternal]=useState(false)
  const article=useRef<HTMLElement|null>(null),task=useRef<AbortController>(),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState('')
  useEffect(()=>{setExportError('');return()=>task.current?.abort()},[source,path])
  useEffect(()=>setExternal(false),[path])
  const headings=useMemo(()=>{
    const tree=unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(source),items:{id:string;slug:string;title:string;level:number}[]=[],counts=new Map<string,number>()
    const text=(node:any):string=>typeof node.value==='string'?node.value:(node.children??[]).map(text).join('')
    visit(tree,'heading',(node:any)=>{const title=text(node),base=title.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu,'').replace(/\s/g,'-'),count=counts.get(base)??0;counts.set(base,count+1);items.push({id:'section-'+node.position.start.line,slug:base+(count?'-'+count:''),title,level:node.depth})})
    return items
  },[source])
  const heading=(tag:'h1'|'h2'|'h3'|'h4'|'h5'|'h6')=>({node,...props}:any)=>createElement(tag,{...props,id:'section-'+node.position.start.line})
  const exportDocument=async(format:'html'|'pdf')=>{
    if(!article.current||exporting)return
    const controller=new AbortController();task.current=controller;setExporting(true);setExportError('')
    try{const {exportMarkdownDocument}=await import('@/packages/markdown-export/export');await exportMarkdownDocument(article.current,path,headings,format,controller.signal)}catch(error){if(!controller.signal.aborted&&(error as Error)?.name!=='AbortError')setExportError(ft(error instanceof Error?error.message:'Unable to export the Markdown document'))}finally{setExporting(false)}
  }
  return <Stack data-markdown-file gap="sm" style={{minWidth:0}}>
    <Group gap="xs" wrap="wrap"><Button size="xs" variant="light" loading={exporting} onClick={()=>void exportDocument('pdf')}>{ft('Export PDF')}</Button><Button size="xs" variant="light" loading={exporting} onClick={()=>void exportDocument('html')}>{ft('Export single-file HTML')}</Button>{exporting&&<Button size="xs" variant="subtle" onClick={()=>task.current?.abort()}>{ft('Cancel')}</Button>}</Group>
    {exportError&&<Alert color="red" role="alert">{exportError}</Alert>}
    {/!\[[^\]]*\]\(https?:/i.test(source)&&<Checkbox label={ft('Load external images')} description={ft('External images contact their hosting servers. Local images stay on this device.')} checked={external} onChange={event=>setExternal(event.currentTarget.checked)}/>}
    {headings.length>1&&<details><summary>{ft('Table of contents')}</summary><Stack gap={2} mt="xs">{headings.map(item=><Button key={item.id} variant="subtle" size="compact-sm" justify="start" style={{marginLeft:(item.level-1)*10,whiteSpace:'normal',height:'auto'}} onClick={event=>{const root=event.currentTarget.closest('[data-markdown-file]');root?.querySelector('#'+item.id)?.scrollIntoView({block:'start',behavior:'smooth'})}}>{item.title}</Button>)}</Stack></details>}
    <article ref={article} className="session-markdown-file" style={{minWidth:0,overflowWrap:'anywhere'}}>
      <ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false,trust:false}]]} skipHtml urlTransform={(url,key)=>key==='src'&&/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(url)?url:defaultUrlTransform(url)} components={{
        h1:heading('h1'),h2:heading('h2'),h3:heading('h3'),h4:heading('h4'),h5:heading('h5'),h6:heading('h6'),
        img:({src,alt})=><LocalImage src={src} alt={alt} allowed={external} path={path} resolve={resolveImage}/>,
        a:({href,children})=><a href={href} rel="noreferrer" onClick={event=>{event.preventDefault();if(href?.startsWith('#')){let fragment=href.slice(1);try{fragment=decodeURIComponent(fragment)}catch{return}const target=headings.find(item=>item.slug===fragment||item.id===fragment);event.currentTarget.closest('[data-markdown-file]')?.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(node=>{if(node.id===target?.id)node.scrollIntoView({block:'start'})});return}const target=relativeResourcePath(path,href||'');if(target)openFile(target);else if(/^https?:\/\//i.test(href||''))openExternal(href!)}}>{children}</a>,
        code:({className,children})=>className==='language-mermaid'?<span style={{display:'block',maxWidth:'100%',overflow:'auto'}}><LocalMermaid source={String(children).trim()}/></span>:<code className={className}>{children}</code>,
        pre:({children})=><pre style={{maxWidth:'100%',overflow:'auto',padding:12,background:'var(--chatbox-background-secondary)'}}>{children}</pre>,
        table:({children})=><div style={{maxWidth:'100%',overflowX:'auto'}}><table>{children}</table></div>,
      }}>{source}</ReactMarkdown>
    </article>
  </Stack>
}
