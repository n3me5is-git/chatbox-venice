import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {processLaTeX} from '@/packages/latex'
import {parseKnowledgeEvidenceUrl} from '@shared/knowledge-evidence'
import 'katex/dist/katex.min.css'
import './review-markdown.css'
/** Read-only Markdown: no remote images, HTML, scripts, diagram execution or automatic requests. */
export function ReviewMarkdown({text}:{text:string}){
 return <div className="knowledge-review-markdown" style={{minWidth:0,overflowWrap:'anywhere',lineHeight:1.6}}><ReactMarkdown skipHtml remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{trust:false,strict:'ignore',throwOnError:false,maxExpand:1000}]]} components={{
  img:({alt})=><span>{alt||''}</span>,
  pre:({children})=><pre style={{maxWidth:'100%',overflow:'auto',padding:12,background:'var(--chatbox-background-secondary)',borderRadius:8}}>{children}</pre>,
  table:({children})=><div style={{maxWidth:'100%',overflowX:'auto'}}><table>{children}</table></div>,
  a:({href,children})=>{const local=parseKnowledgeEvidenceUrl(href);let external=false;try{const url=new URL(href||'');external=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!/(^|\.)chatbox\.invalid$/i.test(url.hostname)}catch{};if(!local&&!external)return <span>{children}</span>;return <a href={href} onClick={event=>{event.preventDefault();event.stopPropagation();if(local)void import('./KnowledgeEvidence').then(module=>module.openKnowledgeEvidence(local));else void import('@/platform').then(({default:platform})=>platform.openLink(href!))}}>{children}</a>}
 }}>{processLaTeX(text)}</ReactMarkdown></div>
}
