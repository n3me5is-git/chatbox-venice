import type {KnowledgeClaim} from './knowledge-verification'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
/** Project UI offsets through a known display-only normalization. Marker removal
 * must reproduce the exact displayed Markdown; ambiguous transforms get no badges. */
export function displayKnowledgeClaims(source:string,display:string,claims:readonly KnowledgeClaim[],offset:number,transform:(value:string)=>string){
 const hidden=claims.map(claim=>({...claim,start:-1,end:-1}));if(offset<0)return hidden
 if(source===display)return claims.map(claim=>({...claim,start:claim.start-offset,end:claim.end-offset}))
 let prefix='\uE000KB';while(source.includes(prefix)||display.includes(prefix))prefix+='K'
 const markers=new Map<string,number>(),edits=claims.map((claim,index)=>({at:claim.end-offset,index})).filter(row=>row.at>0&&row.at<=source.length).sort((a,b)=>b.at-a.at)
 let marked=source;for(const row of edits){const marker=prefix+row.index+'\uE001';markers.set(marker,row.index);marked=marked.slice(0,row.at)+marker+marked.slice(row.at)}
 const normalized=transform(marked),positions=new Map<number,number>();let clean='',cursor=0
 while(cursor<normalized.length){const at=normalized.indexOf(prefix,cursor);if(at<0){clean+=normalized.slice(cursor);break}clean+=normalized.slice(cursor,at);const end=normalized.indexOf('\uE001',at),marker=normalized.slice(at,end+1),index=markers.get(marker);if(end<0||index===undefined||positions.has(index))return hidden;positions.set(index,clean.length);cursor=end+1}
 if(clean!==display||positions.size!==markers.size)return hidden
 return hidden.map((claim,index)=>positions.has(index)?{...claim,end:positions.get(index)!}:claim)
}
const textValue=(node:any):string=>typeof node.value==='string'?node.value:(node.children||[]).map(textValue).join('')
/** UI-only annotations. Stored/signed Markdown and its answer hash are untouched. */
export function remarkKnowledgeClaims(options:{claims:readonly KnowledgeClaim[];offset:number;source?:string}){
 return(tree:any)=>{const badge=(index:number)=>({type:'link',url:'#knowledge-claim-'+index,data:{hProperties:{'data-knowledge-claim':String(index)}},children:[{type:'text',value:'◉'}]});const walk=(parent:any,insideLink=false)=>{if(!parent.children)return;const next:any[]=[];for(const child of parent.children){const start=(child.position?.start.offset??-1)+options.offset,end=(child.position?.end.offset??-1)+options.offset,hits=options.claims.map((claim,index)=>({claim,index})).filter(({claim})=>claim.end>start&&claim.end<=end);if(child.type==='text'&&!insideLink&&hits.length){let cursor=0;for(const {claim,index}of hits){let at=child.value.length===end-start?claim.end-start:child.value.length;if(options.source&&child.value.length!==end-start){const raw=options.source.slice(start-options.offset,end-options.offset),parser=()=>unified().use(remarkParse),whole=textValue(parser().parse(raw)),prefix=textValue(parser().parse(raw.slice(0,claim.end-start)));if(whole===child.value&&child.value.startsWith(prefix))at=prefix.length}if(at>cursor)next.push({...child,value:child.value.slice(cursor,at)});next.push(badge(index));cursor=at}if(cursor<child.value.length)next.push({...child,value:child.value.slice(cursor)});continue}walk(child,insideLink||child.type==='link');next.push(child);if(!insideLink&&['link','inlineCode','code','math','inlineMath','image','imageReference','html'].includes(child.type))for(const {index}of hits)next.push(badge(index))}parent.children=next};walk(tree)}
}
