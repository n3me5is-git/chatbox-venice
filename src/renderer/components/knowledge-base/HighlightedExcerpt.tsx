import type {ReactNode} from 'react'
/** Literal, bounded highlighting; user search strings are never regular expressions. */
export function HighlightedExcerpt({text,query}:{text:string;query:string}){
 if(!query.trim())return <>{text}</>
 const needle=query.trim().toLocaleLowerCase(),haystack=text.toLocaleLowerCase(),parts:ReactNode[]=[];let at=0,count=0
 while(count++<500){const next=haystack.indexOf(needle,at);if(next<0)break;parts.push(text.slice(at,next),<mark key={next} style={{background:'#8fc8ff',color:'#111'}}>{text.slice(next,next+needle.length)}</mark>);at=next+needle.length}
 parts.push(text.slice(at));return <>{parts}</>
}
