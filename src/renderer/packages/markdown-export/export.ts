import { CHATBOX_BUILD_PLATFORM } from '@/variables'
import { AndroidDocumentSaver } from '@/platform/android_document_saver'
import platform from '@/platform'
import { standaloneMarkdown,type ExportHeading } from './standalone'
export async function exportMarkdownDocument(element:HTMLElement,path:string,headings:ExportHeading[],format:'html'|'pdf',signal:AbortSignal){
  const filename=(path.split('/').pop()||'document').replace(/\.(?:md|markdown)$/i,'').replace(/[\\/:*?"<>|%\u0000-\u001f]/g,'_')
  const html=await standaloneMarkdown(element,filename,headings,signal);signal.throwIfAborted()
  if(format==='html'){await platform.exporter.exportBlob(filename+'.html',new Blob([html],{type:'text/html;charset=utf-8'}));return}
  if(platform.type==='desktop'){
    const bytes:Uint8Array=await window.electronAPI.invoke('markdown:pdf',html)
    signal.throwIfAborted();await platform.exporter.exportBlob(filename+'.pdf',new Blob([Uint8Array.from(bytes)],{type:'application/pdf'}));return
  }
  if(platform.type==='mobile'&&CHATBOX_BUILD_PLATFORM==='android'){await AndroidDocumentSaver.printHtml({html,name:filename});return}
  const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.cssText='position:fixed;left:-100000px;width:210mm;height:297mm;border:0';frame.srcdoc=html
  await new Promise<void>((resolve,reject)=>{frame.onload=()=>resolve();frame.onerror=()=>reject(Error('Unable to prepare PDF export'));document.body.append(frame)})
  try{signal.throwIfAborted();await frame.contentDocument?.fonts.ready;const target=frame.contentWindow;if(!target)throw Error('Unable to prepare PDF export');const remove=()=>frame.remove();target.addEventListener('afterprint',remove,{once:true});setTimeout(remove,120000);target.focus();target.print()}catch(error){frame.remove();throw error}
}
