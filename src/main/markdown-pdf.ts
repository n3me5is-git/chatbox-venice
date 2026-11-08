import { BrowserWindow,ipcMain } from 'electron'
let active=false
export function registerMarkdownPDF(main:()=>BrowserWindow|null){
  ipcMain.handle('markdown:pdf',async(event,html:unknown)=>{
    const owner=main(),frame=event.senderFrame
    if(!owner||event.sender!==owner.webContents||!frame||frame.routingId!==event.sender.mainFrame.routingId||frame.processId!==event.sender.mainFrame.processId)throw Error('Only the app can export Markdown')
    const origin=new URL(frame.url)
    if(origin.protocol!=='file:'&&!(process.env.NODE_ENV==='development'&&origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('Untrusted PDF export caller')
    if(typeof html!=='string'||Buffer.byteLength(html)>32*1024*1024)throw Error('The standalone document exceeds the export size limit')
    if(active)throw Error('Another PDF export is already running')
    active=true;let view:BrowserWindow|undefined,timer:ReturnType<typeof setTimeout>|undefined
    try{
      view=new BrowserWindow({show:false,width:1000,height:1400,webPreferences:{partition:'markdown-pdf-'+crypto.randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false,webSecurity:true}})
      view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-navigate',event=>event.preventDefault())
      view.webContents.session.setPermissionRequestHandler((_web,_permission,callback)=>callback(false))
      view.webContents.session.webRequest.onBeforeRequest((request,callback)=>callback({cancel:!request.url.startsWith('data:')&&request.url!=='about:blank'}))
      const render=async()=>{await view!.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));const bytes=await view!.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true});if(bytes.length>64*1024*1024)throw Error('PDF exceeds the export size limit');return Uint8Array.from(bytes)}
      return await Promise.race([render(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('PDF export timed out')),60000)})])
    }finally{if(timer)clearTimeout(timer);if(view&&!view.isDestroyed())view.destroy();active=false}
  })
}
