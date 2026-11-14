/** A conservative local evidence guard for explicit model-control directives.
 * This is a bounded heuristic, not a complete prompt-injection detector. Keep
 * factual statements before a directive usable; never treat a directive as proof. */
export function knowledgeInstructionRanges(content:string){
 const pattern=/(?:\bsystem\s+override\b|\bignore\s+(?:all\s+)?(?:previous|prior|above|system|developer)[^\n]{0,60}\binstructions?\b|\b(?:disregard|bypass|override)[^\n]{0,60}\b(?:system|developer|verifier|evaluator)[^\n]{0,30}\b(?:instructions?|rules?)\b|\bignora[^\n]{0,60}\bistruzioni\s+(?:precedenti|di\s+sistema)\b|\b(?:return|output|mark|declare|respond|rispondi|restituisci|segna|dichiara)[^\n]{0,80}\b(?:supported|verified|supportat[oa]|verificat[oa])\b[^\n]{0,80}\b(?:regardless|ignore|despite|even\s+if|comunque|ignora|indipendentemente)\b|<\|(?:im_start|start_header_id)\|>\s*(?:system|developer)|\[(?:SYSTEM|DEVELOPER)\]|(?:^|\n)\s*#{1,3}\s*(?:SYSTEM|DEVELOPER)\s*:)/gimu
 const ranges:{start:number;end:number}[]=[];for(const match of content.matchAll(pattern)){const start=match.index!,newline=content.indexOf('\n',start),end=newline<0?content.length:newline,previous=ranges.at(-1);if(previous&&start<=previous.end)previous.end=Math.max(previous.end,end);else ranges.push({start,end})}return ranges
}
export function usableKnowledgeQuote(content:string,quote:string,ranges=knowledgeInstructionRanges(content)){
 if(!quote.trim())return false
 if(!ranges.length)return content.includes(quote)
 let at=-1;for(let n=0;n<128;n++){at=content.indexOf(quote,at+1);if(at<0)return false;if(!ranges.some(range=>at<range.end&&at+quote.length>range.start))return true}return false
}
