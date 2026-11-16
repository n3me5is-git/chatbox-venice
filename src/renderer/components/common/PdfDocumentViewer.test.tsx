// @vitest-environment jsdom
import {act,cleanup,render,screen,waitFor} from '@testing-library/react'
import {MantineProvider} from '@mantine/core'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({destroy:vi.fn(),cancel:vi.fn(),render:vi.fn(),getPage:vi.fn(),getDocument:vi.fn()}))
vi.mock('@/packages/pdf-parser',()=>({loadPdfjs:async()=>({getDocument:f.getDocument})}))
import {PdfDocumentViewer} from './PdfDocumentViewer'
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});f.getDocument.mockReturnValue({promise:Promise.resolve({numPages:3,getPage:f.getPage}),destroy:f.destroy});f.getPage.mockResolvedValue({getViewport:({scale}:{scale:number})=>({width:1000*scale,height:1500*scale}),render:f.render,cleanup:vi.fn()});f.render.mockReturnValue({promise:Promise.resolve(),cancel:f.cancel})})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('renders a bounded local page and destroys the document and canvas when closed',async()=>{
 const view=render(<MantineProvider><PdfDocumentViewer url="blob:local-pdf" name="report.pdf" initialPage={2}/></MantineProvider>);await waitFor(()=>expect(f.render).toHaveBeenCalled());await waitFor(()=>expect(screen.getByTestId('pdf-document-viewer').getAttribute('aria-busy')).toBe('false'));expect(f.getPage).toHaveBeenCalledWith(2);const canvas=view.container.querySelector('canvas')!;expect(canvas.width*canvas.height).toBeLessThanOrEqual(4_000_000);view.unmount();expect(f.destroy).toHaveBeenCalledOnce();expect(f.cancel).toHaveBeenCalled();expect(canvas.width).toBe(0);expect(canvas.height).toBe(0)
})
it('cancels pending loading on a source change and ignores its late result',async()=>{
 let complete!:(value:any)=>void;const destroy=vi.fn();f.getDocument.mockReturnValueOnce({promise:new Promise(resolve=>{complete=resolve}),destroy});const view=render(<MantineProvider><PdfDocumentViewer url="blob:old" name="old.pdf"/></MantineProvider>);await waitFor(()=>expect(f.getDocument).toHaveBeenCalledOnce());view.rerender(<MantineProvider><PdfDocumentViewer url="blob:new" name="new.pdf"/></MantineProvider>);await waitFor(()=>expect(destroy).toHaveBeenCalledOnce());await act(async()=>complete({numPages:99,getPage:vi.fn()}));await waitFor(()=>expect(f.render).toHaveBeenCalled());expect(screen.getByText('new.pdf')).toBeTruthy();expect(screen.queryByText('Page 1 / 99')).toBeNull()
})
