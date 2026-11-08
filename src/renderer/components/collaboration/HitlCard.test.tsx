// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {afterEach,beforeAll,it,expect,vi} from 'vitest'
import {HitlCard} from './HitlCard'
beforeAll(()=>{window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});global.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}}})
afterEach(cleanup)
it('accepts multiple choices and a custom answer without selecting anything automatically',async()=>{
 const answer=vi.fn(async()=>{})
 render(<MantineProvider><HitlCard request={{id:crypto.randomUUID(),requester:'alice',expires:Date.now()+10000,policy:'requester',input:{kind:'questions',input:{questions:[{question:'What should I create?',options:['Image','Video'],multiple:true}]}}}} answer={answer}/></MantineProvider>)
 const submit=screen.getByRole('button',{name:'Send answers'});expect((submit as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByLabelText('Image'));fireEvent.click(screen.getByLabelText('Video'));fireEvent.change(screen.getByLabelText('Your answer'),{target:{value:'Use a blue background'}});fireEvent.click(submit)
 await waitFor(()=>expect(answer).toHaveBeenCalledWith({answers:[{selected:['Image','Video'],text:'Use a blue background'}]}))
})
it('rejects explicitly without turning cancellation into an approval',async()=>{
 const answer=vi.fn(async()=>{});render(<MantineProvider><HitlCard request={{id:crypto.randomUUID(),requester:'alice',expires:Date.now()+10000,policy:'first',input:{kind:'confirm',title:'Pay for image?',detail:'$1'}}} answer={answer}/></MantineProvider>);fireEvent.click(screen.getByRole('button',{name:'Reject'}));await waitFor(()=>expect(answer).toHaveBeenCalledWith(false))
})
