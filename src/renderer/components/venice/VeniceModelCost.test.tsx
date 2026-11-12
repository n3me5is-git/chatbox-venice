// @vitest-environment jsdom
import {MantineProvider} from '@mantine/core'
import {render,screen,cleanup} from '@testing-library/react'
import {it,expect,afterEach,vi,beforeAll} from 'vitest'
import {VeniceModelCost} from './VeniceModelCost'
import {GenerationFailureReason} from './GenerationFailureReason'
beforeAll(()=>{window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}})})
afterEach(cleanup)
it('shows the video comparison and preserves the reference date without network calls',()=>{
 render(<MantineProvider><VeniceModelCost comparison model={{id:'wan-2.5-preview-text-to-video',type:'video'}}/></MantineProvider>)
 expect(screen.getByText(/720p \/ 5 s/).textContent).toContain('$0.55')
 expect(screen.getByText(/720p \/ 5 s/).title).toContain('Reference updated:')
})
it('shows an approximate 30-second voice cost and an honest character assumption',()=>{
 render(<MantineProvider><VeniceModelCost comparison model={{id:'voice',type:'tts',model_spec:{pricing:{input:{usd:10}}}}}/></MantineProvider>)
 expect(screen.getByText(/30 s/).textContent).toContain('≈')
 expect(screen.getByText(/30 s/).title).toContain('413 characters')
})
it('shows the actual image price range rather than an upscale fee or a quality score',()=>{
 render(<MantineProvider><VeniceModelCost showLabel model={{id:'krea-2-turbo',type:'image',model_spec:{pricing:{resolutions:{'1K':{usd:0.04},'2K':{usd:0.06}},upscale:{'2x':{usd:0.02}}}}}}/></MantineProvider>)
 expect(screen.getByText(/\$0\.04–\$0\.06/).textContent).toContain('image');expect(screen.queryByText(/\$0\.02/)).toBeNull()
})
it('shows missing prices explicitly and displays the failure reason without opening details',()=>{
 render(<MantineProvider><VeniceModelCost showLabel model={{id:'video',type:'video'}}/><GenerationFailureReason error={'Venice /video/queue failed (HTTP 422): Unsupported resolution. No paid request was retried.'}/></MantineProvider>)
 expect(screen.getByText('Price not supplied by the provider')).toBeTruthy();expect(screen.getByText('Unsupported resolution')).toBeTruthy();expect(screen.getByText(/HTTP 422/)).toBeTruthy()
})
