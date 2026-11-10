/** Browser-safe recursive splitting, with the KB's 1200-character target and 150 overlap.
 * Offsets refer to the original text: citations never use reconstructed paragraphs. */
export const RAG_CHUNKER_VERSION = 2
export function recursiveRagChunks(input: string) {
  if (input.length > 500000) throw Error('Document text exceeds the indexing limit')
  const text = input.replace(/\r\n?/g, '\n'), starts = [0]
  for (let n = 0; n < text.length; n++) if (text[n] === '\n') starts.push(n + 1)
  const lineAt = (offset: number) => { let low=0,high=starts.length;while(low+1<high){const mid=(low+high)>>1;if(starts[mid]<=offset)low=mid;else high=mid}return low+1 }
  const pages=[...text.matchAll(/^==== Page (\d+) ====$/gm)].map(match=>({at:match.index!,page:Number(match[1])}))
  const chunks: {text:string;line:number;endLine:number;page?:number}[]=[]
  let start=0
  while(start<text.length){
    let end=Math.min(start+1200,text.length)
    const nextPage=pages.find(page=>page.at>start&&page.at<end)
    if(nextPage)end=nextPage.at
    else if(end<text.length){
      // Prefer sections, paragraphs and lines before falling back to word boundaries.
      for(const separator of ['\n#','\n\n','\n',' ']){const split=text.lastIndexOf(separator,end);if(split>start+480){end=split+(separator==='\n#'?1:separator.length);break}}
    }
    const raw=text.slice(start,end),leading=raw.length-raw.trimStart().length,content=raw.trim()
    if(content)chunks.push({text:content,line:lineAt(start+leading),endLine:lineAt(end-1),page:pages.filter(page=>page.at<=start+leading).at(-1)?.page})
    if(end===text.length)break
    const boundary=pages.some(page=>page.at===end)
    start=boundary?end:Math.max(start+1,end-150)
  }
  return chunks
}
