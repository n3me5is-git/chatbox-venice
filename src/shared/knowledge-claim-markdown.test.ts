import {expect,it} from 'vitest'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import {remarkKnowledgeClaims} from './knowledge-claim-markdown'
import type {KnowledgeClaim} from './knowledge-verification'
it('puts independent badges beside both statements without changing stored Markdown',()=>{const text='First statement. **Second statement.**',at=text.indexOf('Second'),claims=[{start:0,end:16,text:'First statement.',verdict:'supported',reason:'',evidence:[]},{start:at,end:at+17,text:'Second statement.',verdict:'mixed',reason:'',evidence:[]}] as KnowledgeClaim[],tree=unified().use(remarkParse).parse(text);remarkKnowledgeClaims({claims,offset:0})(tree);expect(JSON.stringify(tree)).toContain('#knowledge-claim-0');expect(JSON.stringify(tree)).toContain('#knowledge-claim-1');expect(text).toBe('First statement. **Second statement.**')})
