import { DOMParser } from 'linkedom/worker'
import { readOfficeArchive } from './office-text'

function document(value:string,type:'text/html'|'text/xml'='text/xml'){
  if(type==='text/xml'&&/<!DOCTYPE|<!ENTITY/i.test(value))throw Error('Unsupported document XML')
  return new DOMParser().parseFromString(value,type)
}
function htmlText(value:string){
  const doc=document(value,'text/html')
  for(const element of doc.querySelectorAll('script,style,iframe,object,svg'))element.remove()
  for(const element of doc.querySelectorAll('p,div,section,li,h1,h2,h3,h4,tr,br'))element.appendChild(doc.createTextNode('\n'))
  return (doc.body?.textContent||doc.documentElement?.textContent||'').replace(/\n[ \t]+/g,'\n').trim()
}
function resolveArchive(base:string,target:string){
  if(/^[a-z]+:|^\/|[\\\0]/i.test(target))throw Error('Invalid document resource path')
  const parts=base.split('/').slice(0,-1)
  for(const part of decodeURIComponent(target).split('/')){if(part==='..'){if(!parts.length)throw Error('Invalid document resource path');parts.pop()}else if(part!=='.'&&part)parts.push(part)}
  return parts.join('/')
}
/** ZIP extraction is bounded by the same archive guards as DOCX/XLSX/PPTX. */
export function extendedDocument(name:string,bytes:Uint8Array):string{
  if(/\.(html?|xhtml)$/i.test(name))return htmlText(new TextDecoder().decode(bytes))
  if(/\.rtf$/i.test(name))return rtfText(new TextDecoder('windows-1252').decode(bytes))
  const entries=readOfficeArchive(bytes,path=>/\.(xml|opf|html?|xhtml)$/i.test(path))
  if(/\.epub$/i.test(name)){
    const container=document(entries.get('META-INF/container.xml')||'')
    const root=container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path')
    if(!root||!entries.has(root))throw Error('EPUB package is missing')
    const opf=document(entries.get(root)!),items=new Map(Array.from(opf.getElementsByTagName('item')).map(item=>[item.getAttribute('id'),item.getAttribute('href')]))
    return Array.from(opf.getElementsByTagName('itemref')).map(item=>{const href=items.get(item.getAttribute('idref'));if(!href)throw Error('EPUB chapter is missing');const content=entries.get(resolveArchive(root,href));if(content===undefined)throw Error('EPUB chapter is missing');return htmlText(content)}).join('\n\n')
  }
  const content=entries.get('content.xml');if(!content)throw Error('OpenDocument content is missing')
  const doc=document(content),parts:string[]=[]
  for(const node of doc.getElementsByTagName('*'))if(/^(?:text:)?(?:p|h)$/.test(node.tagName))parts.push(node.textContent||'')
  return parts.join('\n')
}
export function rtfText(value:string){
  if(!value.startsWith('{\\rtf'))throw Error('Invalid RTF document')
  const stack:{skip:boolean;uc:number}[]=[];let state={skip:false,uc:1},out='',skipChars=0
  const append=(text:string)=>{if(skipChars){skipChars--;return}if(!state.skip)out+=text}
  for(let n=0;n<value.length;){const ch=value[n++]
    if(ch==='{'){stack.push({...state});if(stack.length>256)throw Error('RTF nesting limit exceeded');continue}
    if(ch==='}'){state=stack.pop()||{skip:false,uc:1};continue}
    if(ch!=='\\'){if(ch!=='\r'&&ch!=='\n')append(ch);continue}
    const tail=value.slice(n),hex=/^'([a-f0-9]{2})/i.exec(tail)
    if(hex){append(new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(hex[1],16)])));n+=3;continue}
    if(/^[\\{}]/.test(tail)){append(value[n++]);continue}
    if(tail[0]==='*'){state.skip=true;n++;continue}
    const token=/^([a-z]+)(-?\d+)? ?/i.exec(tail);if(!token){if(value[n]==='~')append(' ');n++;continue}n+=token[0].length
    const word=token[1],number=Number(token[2])
    if(['fonttbl','colortbl','stylesheet','info','pict','object','header','footer','fldinst'].includes(word))state.skip=true
    else if(word==='uc')state.uc=Math.max(0,Math.min(10,number))
    else if(word==='u'&&!state.skip){out+=String.fromCharCode(number<0?number+65536:number);skipChars=state.uc}
    else if(word==='par'||word==='line')append('\n')
    else if(word==='tab')append('\t')
  }
  return out.trim()
}
