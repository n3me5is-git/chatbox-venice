import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

type Node={type:string;value?:string;alt?:string;url?:string;identifier?:string;children?:Node[];position?:{start:{offset?:number};end:{offset?:number}}}
const significant=/[\p{L}\p{N}\p{Sm}\p{Sc}%*+\/=<>^-]/u
/** Coverage is measured over visible text, never URI destinations or trusted
 * citation labels. Offsets and answer hashes continue to use the original text.
 * An ordinary link label can itself be an assertion and is always counted. */
export function knowledgeCoverageMask(answer:string,sources:readonly {id:string;name:string;url:string}[]){
 const base=new Uint8Array(answer.length);let offset=0;for(const character of answer){if(significant.test(character))base[offset]=1;offset+=character.length}const mask=new Uint8Array(base.length),tree=unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(answer) as unknown as Node,definitions=new Map<string,string>()
 const bounds=(node:Node)=>({start:node.position?.start.offset??0,end:node.position?.end.offset??0}),set=(node:Node,restore=false)=>{const {start,end}=bounds(node);if(restore)mask.set(base.subarray(start,end),start);else mask.fill(0,start,end)}
 const collect=(node:Node)=>{if(node.type==='definition'&&node.identifier&&node.url)definitions.set(node.identifier.toLowerCase(),node.url);for(const child of node.children||[])collect(child)};collect(tree)
 const label=(node:Node):string=>typeof node.value==='string'?node.value:(node.children||[]).map(label).join('')
 const citation=(node:Node)=>{const url=node.url||(node.identifier?definitions.get(node.identifier.toLowerCase()):undefined),text=label(node).trim();return !!url&&sources.some(source=>source.url===url&&(/^(?:[0-9]{1,3}|(?:source|fonte)\s+[0-9]{1,3}|source|fonte|reference)$/i.test(text)||/^[A-Za-z0-9_.:-]{1,128}$/.test(text)&&text.toLowerCase()===source.id.toLowerCase()||text===source.name&&/^[\p{L}\p{N}_-]{1,80}$/u.test(text)||text===source.name&&/^[^\n<>]{1,100}\.(?:pdf|docx?|md|txt|rtf|html?|xlsx?|pptx?|epub)$/i.test(text)))}
 const visit=(node:Node)=>{
  if(node.type==='definition'){set(node);return}
  if((node.type==='heading'||node.type==='paragraph')&&['summary','sources','references','riepilogo','fonti','riferimenti'].includes(label(node).trim().replace(/:$/,'').toLowerCase())){set(node);return}
  if(node.type==='link'||node.type==='linkReference'){set(node);if(!citation(node))for(const child of node.children||[])visit(child);return}
  if(['strong','emphasis','delete'].includes(node.type)){set(node);for(const child of node.children||[])visit(child);return}
  if(node.type==='text'){set(node,true);return}
  if((node.type==='code'||node.type==='inlineCode'||node.type==='math'||node.type==='inlineMath')&&node.value){const {start,end}=bounds(node),raw=answer.slice(start,end),fenced=node.type==='code'&&/^ {0,3}(?:`{3,}|~{3,})/.test(raw),from=fenced?raw.indexOf('\n')+1:node.type==='inlineCode'?(raw.match(/^`+/)?.[0].length||0):node.type==='inlineMath'||node.type==='math'?(raw.match(/^\$+/)?.[0].length||0):0,at=raw.indexOf(node.value,from);if(at>=0){set(node);mask.set(base.subarray(start+at,start+at+node.value.length),start+at)}else set(node,true);return}
  if(node.type==='image'||node.type==='imageReference'){if(node.alt){const {start,end}=bounds(node),at=answer.slice(start,end).indexOf(node.alt);if(at>=0)mask.set(base.subarray(start+at,start+at+node.alt.length),start+at);else set(node,true)}return}
  if(typeof node.value==='string')set(node,true)
  for(const child of node.children||[])visit(child)
 };visit(tree);return mask
}
export function knowledgeCoverage(answer:string,sources:readonly {id:string;name:string;url:string}[],claims:readonly {start:number;end:number}[]){const mask=knowledgeCoverageMask(answer,sources),total=mask.reduce((n,value)=>n+value,0);let covered=0;for(const claim of claims)for(let n=claim.start;n<claim.end;n++)covered+=mask[n]||0;return total?Math.min(1,covered/total):0}
