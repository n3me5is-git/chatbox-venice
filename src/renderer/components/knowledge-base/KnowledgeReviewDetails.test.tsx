// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {KnowledgeCheckReportSchema} from '@shared/knowledge-verification'
import {KnowledgeReviewDetails} from './KnowledgeReviewDetails'
vi.mock('@/i18n/fork',()=>({forkT:(key:string)=>key}))
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}))
afterEach(cleanup)
const report=()=>KnowledgeCheckReportSchema.parse({version:1,id:crypto.randomUUID(),answerHash:'a'.repeat(64),draftHash:'a'.repeat(64),created:1,status:'incomplete',reason:'partial_coverage',revised:false,calls:1,coverage:.7,omittedEvidence:0,claims:[{start:0,end:30,text:'## Formula\n\nThe score is $x^2$.',verdict:'supported',reason:'The **definition** supports this.',evidence:[{id:'s',quote:'### Definition\n\nScore: $x^2$.\n\n![tracker](https://tracker.invalid/pixel)',stance:'supports'}]},{start:31,end:44,text:'Unknown claim',verdict:'insufficient',reason:'No source supplies this value.',evidence:[]}],sources:[{id:'s',origin:'external',name:'Manual',url:'https://example.org/manual'}]})
it('renders real Markdown and LaTeX without loading images or changing exact evidence',()=>{
 const value=report(),original=JSON.stringify(value),view=render(<MantineProvider env="test"><KnowledgeReviewDetails report={value}/></MantineProvider>)
 expect(screen.getByRole('heading',{name:'Formula'})).toBeTruthy();expect(screen.getByRole('heading',{name:'Definition'})).toBeTruthy();expect(view.container.querySelector('.katex')).toBeTruthy();expect(view.container.querySelector('img')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'View raw text'}));expect(screen.getByText(/### Definition/)).toBeTruthy();expect(JSON.stringify(value)).toBe(original)
})
it('filters by verdict and searches evidence, with a way back from a focused statement',()=>{
 render(<MantineProvider env="test"><KnowledgeReviewDetails report={report()} claimIndex={1}/></MantineProvider>)
 expect(screen.queryByRole('heading',{name:'Formula'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Show all statements'}));expect(screen.getByRole('heading',{name:'Formula'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Supported by sources'}));expect(screen.queryByText('Unknown claim')).toBeNull()
 fireEvent.change(screen.getByRole('textbox',{name:'Search statements and evidence'}),{target:{value:'not present'}});expect(screen.getByText('No statements match these filters.')).toBeTruthy()
})
