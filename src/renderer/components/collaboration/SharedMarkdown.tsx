import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Button, Text } from '@mantine/core'
import type { SharedFile } from '@shared/collaboration'
import { relativeResourcePath } from '@shared/session-resources'
import { LocalMermaid } from '@/components/session-resources/LocalMermaid'
import platform from '@/platform'
import { forkT as ft } from '@/i18n/fork'
import 'katex/dist/katex.min.css'
import '@/components/session-resources/markdown-file.css'

/** Remote Markdown never resolves through the local session sandbox or loads tracking images. */
export function SharedMarkdown({text,files=[],openFile}:{text:string;files?:SharedFile[];openFile?:(file:SharedFile)=>void}){
  const resource=(href?:string)=>{const path=relativeResourcePath('message.md',(href||'').replace(/^sandbox:\/mnt\/data\//,''));return files.find(file=>file.path===path)}
  return <div className="session-markdown-file" style={{minWidth:0,overflowWrap:'anywhere'}}><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{throwOnError:false,trust:false}]]} skipHtml components={{
    a:({href,children})=>{const file=resource(href);return file&&openFile?<Button variant="light" size="compact-sm" onClick={()=>openFile(file)}>{children}</Button>:<a href={/^https?:\/\//i.test(href||'')?href:undefined} rel="noreferrer" onClick={event=>{event.preventDefault();if(/^https?:\/\//i.test(href||''))void platform.openLink(href!)}}>{children}</a>},
    img:({src,alt})=>{const file=resource(src);return file&&openFile?<Button variant="light" size="compact-sm" onClick={()=>openFile(file)}>{alt||file.name}</Button>:<Text component="span" size="xs" c="dimmed">{alt||ft('External image blocked')}</Text>},
    code:({className,children})=>className==='language-mermaid'?<LocalMermaid source={String(children).trim()}/>:<code className={className}>{children}</code>,
    pre:({children})=><pre style={{maxWidth:'100%',overflowX:'auto',padding:12}}>{children}</pre>,
    table:({children})=><div style={{overflowX:'auto',maxWidth:'100%'}}><table>{children}</table></div>,
  }}>{text}</ReactMarkdown></div>
}
