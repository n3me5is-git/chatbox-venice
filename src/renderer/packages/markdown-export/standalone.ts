import katexCSS from 'katex/dist/katex.min.css?raw'
import { relativeResourcePath } from '@shared/session-resources'
const bundledFonts=import.meta.glob('../../../../node_modules/katex/dist/fonts/*.woff2',{eager:true,query:'?inline',import:'default',exhaustive:true}) as Record<string,string>
export const mathFontData=Object.fromEntries(Object.entries(bundledFonts).map(([path,data])=>[path.split('/').pop()!,data]))
export interface ExportHeading {id:string;slug:string;title:string;level:number}
const MAX_HTML_BYTES=32*1024*1024
export const DOCUMENT_STYLE=`:root{color-scheme:light;--chatbox-background-secondary:#f3f4f6;--mantine-color-blue-6:#1758a8;--mantine-color-gray-4:#d1d5db}*{box-sizing:border-box}body{font-family:system-ui,sans-serif;color:#171717;background:white;max-width:900px;margin:0 auto;padding:32px;line-height:1.65}h1,h2,h3,h4,h5,h6{line-height:1.3;break-after:avoid;margin:1.2em 0 .55em}h1{font-size:1.8rem}h2{font-size:1.4rem}a{color:#1758a8;overflow-wrap:anywhere}p,li{overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap!important;overflow-wrap:anywhere;padding:12px;background:#f3f4f6;border-radius:4px}code{font-family:ui-monospace,monospace;font-size:.9em}table{border-collapse:collapse;max-width:100%;width:100%;font-size:.9em}th,td{padding:.45em .65em;border:1px solid #d1d5db;overflow-wrap:anywhere}blockquote{border-left:3px solid #d1d5db;padding-left:1em;margin-left:0}nav{border-bottom:1px solid #d1d5db;padding-bottom:16px}nav ul{list-style:none;padding:0}nav a{text-decoration:none}.katex-display{max-width:100%;overflow:visible}.katex-html{white-space:normal}@page{size:A4;margin:18mm}@media print{body{max-width:none;padding:0;margin:0;font-size:11pt}a{color:inherit}pre,blockquote,img{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}}`
function dataURL(bytes:Uint8Array,mime:string){let binary='';for(let at=0;at<bytes.length;at+=32768)binary+=String.fromCharCode(...bytes.subarray(at,at+32768));return 'data:'+mime+';base64,'+btoa(binary)}
async function fetchBytes(url:string,maximum:number,signal:AbortSignal,fetcher:typeof fetch){
  const response=await fetcher(url,{credentials:'omit',referrerPolicy:'no-referrer',signal,redirect:'error'})
  if(!response.ok||!response.body)throw Error('Unable to embed a preview image or font. Wait for the preview to finish loading and try again.')
  const reader=response.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];let length=0
  try{while(true){signal.throwIfAborted();const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>maximum)throw Error('The standalone document exceeds the export size limit');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;chunk.fill(0)}return {bytes,mime:(response.headers.get('content-type')||'').split(';')[0]}
}
async function embedFonts(css:string,signal:AbortSignal,fetcher:typeof fetch){
  const blocks=[...css.matchAll(/@font-face\s*\{[^}]*\}/g)];let used=0
  for(const [block]of blocks){
    const url=/url\((?:["']?)([^)'"\s]+)(?:["']?)\)\s*format\(["']?woff2["']?\)/.exec(block)?.[1]
    if(!url)throw Error('Unable to embed a preview image or font. Wait for the preview to finish loading and try again.')
    let embedded=mathFontData[url.split('/').pop()!]||url
    if(!embedded.startsWith('data:')){
      const target=new URL(url,import.meta.url),base=new URL(import.meta.url)
      if(target.origin!==base.origin||!['http:','https:','file:'].includes(target.protocol))throw Error('Unexpected document font location')
      const {bytes}=await fetchBytes(target.href,256*1024,signal,fetcher);used+=bytes.length;if(used>2*1024*1024)throw Error('The standalone document exceeds the export size limit')
      try{embedded=dataURL(bytes,'font/woff2')}finally{bytes.fill(0)}
    }
    const start=block.indexOf('src:');let end=start+4,depth=0,quote=''
    for(;end<block.length;end++){const character=block[end];if(quote){if(character===quote&&block[end-1]!=='\\')quote='';continue}if(character==='"'||character==="'"){quote=character;continue}if(character==='(')depth++;else if(character===')')depth--;else if(depth===0&&(character===';'||character==='}'))break}
    css=css.replace(block,block.slice(0,start)+'src:url("'+embedded+'") format("woff2")'+block.slice(end))
  }
  return css
}
export function waitForMarkdownPreview(element:HTMLElement,signal:AbortSignal){
  return new Promise<void>((resolve,reject)=>{
    const done=(error?:unknown)=>{clearTimeout(timer);observer.disconnect();signal.removeEventListener('abort',abort);error?reject(error):resolve()}
    const check=()=>{if(!element.querySelector('[data-export-pending="true"]'))done()}
    const abort=()=>done(signal.reason??new DOMException('Export cancelled','AbortError'))
    const observer=new MutationObserver(check),timer=setTimeout(()=>done(Error('Wait for images and diagrams to finish rendering before exporting')),15000)
    observer.observe(element,{childList:true,subtree:true,attributes:true});signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();else check()
  })
}
/** Capture the rendered document, with no scripts or app controls and no runtime network dependencies. */
export async function standaloneMarkdown(element:HTMLElement,title:string,headings:ExportHeading[],signal:AbortSignal,options:{fetcher?:typeof fetch;fontCSS?:string;documentPath?:string}={}){
  await waitForMarkdownPreview(element,signal)
  const fetcher=options.fetcher??fetch,copy=element.cloneNode(true) as HTMLElement
  copy.querySelectorAll('script,iframe,object,embed,style,link,base,form,button,textarea,select').forEach(node=>node.remove())
  for(const node of [copy,...Array.from(copy.querySelectorAll('*'))])for(const attribute of Array.from(node.attributes)){
    if(/^on/i.test(attribute.name)||['srcset','formaction','action','contenteditable','data-export-pending'].includes(attribute.name))node.removeAttribute(attribute.name)
  }
  let images=0,total=0
  for(const image of Array.from(copy.querySelectorAll('img'))){
    signal.throwIfAborted();if(++images>64)throw Error('The standalone document exceeds the export size limit')
    const src=image.getAttribute('src')||''
    if(!/^(?:blob:|data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,|https?:\/\/)/i.test(src))throw Error('Unexpected document image location')
    const {bytes,mime}=await fetchBytes(src,2*1024*1024,signal,fetcher)
    try{total+=bytes.length;if(total>20*1024*1024)throw Error('The standalone document exceeds the export size limit');if(!/^image\/(?:png|jpeg|gif|webp|svg\+xml)$/i.test(mime))throw Error('Unexpected document image type');image.src=dataURL(bytes,mime);image.removeAttribute('loading')}finally{bytes.fill(0)}
  }
  for(const link of Array.from(copy.querySelectorAll('a'))){
    const href=link.getAttribute('href')||''
    if(href.startsWith('#')){let slug=href.slice(1);try{slug=decodeURIComponent(slug)}catch{}const heading=headings.find(item=>item.slug===slug||item.id===slug);if(heading)link.setAttribute('href','#'+heading.id)}
    else if(!/^https?:\/\//i.test(href)&&!relativeResourcePath(options.documentPath??'document.md',href))link.removeAttribute('href')
    link.setAttribute('rel','noreferrer noopener')
  }
  const document=globalThis.document.implementation.createHTMLDocument(title),charset=document.createElement('meta');charset.setAttribute('charset','UTF-8');document.head.prepend(charset)
  const csp=document.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";document.head.append(csp)
  const style=document.createElement('style');style.textContent=DOCUMENT_STYLE+(copy.querySelector('.katex')?await embedFonts(options.fontCSS??katexCSS,signal,fetcher):'');document.head.append(style)
  if(headings.length>1){const nav=document.createElement('nav'),list=document.createElement('ul');nav.setAttribute('aria-label','Table of contents');for(const item of headings){const li=document.createElement('li'),a=document.createElement('a');a.href='#'+item.id;a.textContent=item.title;li.style.marginLeft=(item.level-1)*12+'px';li.append(a);list.append(li)}nav.append(list);document.body.append(nav)}
  document.body.append(document.importNode(copy,true));signal.throwIfAborted()
  const html='<!doctype html>\n'+document.documentElement.outerHTML
  if(new TextEncoder().encode(html).length>MAX_HTML_BYTES)throw Error('The standalone document exceeds the export size limit')
  return html
}
