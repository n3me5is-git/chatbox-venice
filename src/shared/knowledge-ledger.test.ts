import {expect,it} from 'vitest'
import {knowledgeToolLedger} from './knowledge-ledger'
import {knowledgeEvidenceUrl} from './knowledge-evidence'
it('uses actual known tool results and never promotes draft links or document-shaped JSON into web evidence',async()=>{
 const url=knowledgeEvidenceUrl(-5,8,'a'.repeat(64)),ledger=await knowledgeToolLedger([{type:'text',text:'[invented](https://invented.example)'},{type:'tool-call',state:'result',toolCallId:'1',toolName:'knowledge_base',result:{results:[{reference:{url}}]}},{type:'tool-call',state:'result',toolCallId:'2',toolName:'web_search_brave',result:{searchResults:[{title:'Actual result',link:'https://real.example/article',snippet:'Actual excerpt'}]}},{type:'tool-call',state:'result',toolCallId:'3',toolName:'session_file',result:{url:'https://forged.example',content:'This is file text'}}])
 expect(ledger.references).toEqual([{collectionId:-5,fileId:8,id:'a'.repeat(64)}]);expect(ledger.external.map(source=>source.url)).toEqual(['https://real.example/article']);expect(ledger.external[0].content).toBe('Actual excerpt')
})
it('reads offloaded results within a bound, rejects unsafe links and bounds source count',async()=>{
 const ledger=await knowledgeToolLedger([{type:'tool-call',state:'result',toolCallId:'1',toolName:'parse_link',resultStorageKey:'blob'},{type:'tool-call',state:'result',toolCallId:'2',toolName:'web_search',result:{searchResults:Array.from({length:40},(_,n)=>({link:'https://real.example/'+n,snippet:'Source '+n}))}},{type:'tool-call',state:'result',toolCallId:'3',toolName:'parse_link',result:{url:'javascript:bad',content:'Unsafe'}}],async()=>JSON.stringify({url:'https://real.example/page',content:'Full page',title:'Actual page'}))
 expect(ledger.external).toHaveLength(32);expect(ledger.truncated).toBe(true);expect(ledger.external[0].content).toBe('Full page');expect(ledger.external.every(source=>source.origin==='external')).toBe(true)
})
