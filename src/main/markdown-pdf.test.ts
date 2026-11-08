import { beforeEach,expect,it,vi } from 'vitest'
const state=vi.hoisted(()=>({handler:undefined as any,views:[] as any[],owner:{} as any}))
vi.mock('electron',()=>({ipcMain:{handle:(_name:string,handler:any)=>{state.handler=handler}},BrowserWindow:class{
  destroyed=false;options:any;webContents={setWindowOpenHandler:vi.fn(),on:vi.fn(),session:{setPermissionRequestHandler:vi.fn(),webRequest:{onBeforeRequest:vi.fn()}},printToPDF:vi.fn(async()=>new Uint8Array([37,80,68,70]))}
  constructor(options:any){this.options=options;state.views.push(this)}async loadURL(_url:string){}isDestroyed(){return this.destroyed}destroy(){this.destroyed=true}
}}))
import { registerMarkdownPDF } from './markdown-pdf'
beforeEach(()=>{state.views=[];const frame={routingId:1,processId:1,url:'file:///app/index.html'};state.owner={webContents:{mainFrame:frame}};registerMarkdownPDF(()=>state.owner)})
const event=()=>({sender:state.owner.webContents,senderFrame:state.owner.webContents.mainFrame})
it('renders PDF in a disposable browser with no app bridge, scripts or network',async()=>{
  const result=await state.handler(event(),'<html><body>Report</body></html>'),view=state.views[0]
  expect([...result]).toEqual([37,80,68,70]);expect(view.options.webPreferences).toMatchObject({nodeIntegration:false,javascript:false,sandbox:true,contextIsolation:true});expect(view.destroyed).toBe(true)
  const network=view.webContents.session.webRequest.onBeforeRequest.mock.calls[0][0],callback=vi.fn();network({url:'https://tracker.test'},callback);expect(callback).toHaveBeenCalledWith({cancel:true})
  expect(view.webContents.printToPDF).toHaveBeenCalledWith(expect.objectContaining({pageSize:'A4',printBackground:true}))
})
it('rejects iframe and oversized requests before creating a browser',async()=>{
  await expect(state.handler({...event(),senderFrame:{routingId:2,processId:1,url:'file:///app/index.html'}},'<html>')).rejects.toThrow('Only the app')
  await expect(state.handler(event(),'x'.repeat(33*1024*1024))).rejects.toThrow('size limit');expect(state.views).toHaveLength(0)
})
