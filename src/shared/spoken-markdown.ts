import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
export function spokenMarkdown(source:string){
  const tree=unified().use(remarkParse).use(remarkGfm).parse(source)
  const read=(node:any):string=>{
    if(['code','html','definition','image'].includes(node.type))return ''
    if(typeof node.value==='string')return node.value
    const value=(node.children??[]).map(read).join(node.type==='tableRow'?' · ':'')
    return value+(['paragraph','heading','listItem','tableRow','blockquote'].includes(node.type)?'\n':'')
  }
  return read(tree).replace(/\n{3,}/g,'\n\n').trim()
}
