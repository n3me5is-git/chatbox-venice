import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'

export const auditedScreens=['knowledge-base','pdf-viewer','studio-speech','studio-transcription','studio-video','studio-music','studio-sound-effects','studio-voice-conversion','knowledge-models','knowledge-intelligence','knowledge-review','knowledge-graph','knowledge-evidence','venice-search','venice-image-settings','venice-modules','venice-profile','subscription','web-search','chat-privacy','e2ee-tools','receipts','approvals','questions','generation-failure','multi-agent-settings','agent-calling-details','agent-transcript','security','library-settings','archive-storage','collaboration','transfer','mcp-session','mcp-application']

export async function runMobilePages({cdp,evaluate,click,wait,output,openPage,onStep=()=>{}}){
 const report=[],failures=[]
 const persist=()=>writeFile(path.join(output,'mobile-screen-matrix.json'),JSON.stringify({productionTheme:true,productionSettingsRoute:true,nativeFolderVisible:true,physicalDevice:false,failures,report},null,2))
 const screenshot=async name=>{await writeFile(path.join(output,name+'.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))}
 const capture=async(screen,variant)=>{
  // Loading indicators and restarted transitions must not hold the audit forever.
  await evaluate(`Promise.race([Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,700))])`)
  const geometry=await evaluate(`(()=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';const buttons=[...document.querySelectorAll('button')].filter(visible).map(e=>{const r=e.getBoundingClientRect(),l=e.querySelector('.mantine-Button-label');return {text:e.textContent||e.getAttribute('aria-label'),width:r.width,height:r.height,labelHeight:l?.getBoundingClientRect().height,lineHeight:l?parseFloat(getComputedStyle(l).lineHeight):null,clipped:l?l.scrollWidth>l.clientWidth+1:false}});return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons,body:document.body.innerText}})()`)
  await screenshot('screen-'+screen+'-'+variant)
  report.push({screen,variant,...geometry});await persist()
  assert.ok(geometry.scrollWidth<=geometry.viewport+1,screen+' overflows horizontally: '+JSON.stringify(geometry))
  const compressed=geometry.buttons.filter(b=>b.text?.trim()&&b.labelHeight>3.1*b.lineHeight)
  assert.deepEqual(compressed,[],screen+' has buttons with crushed labels')
  assert.ok(!/Something went wrong|An unexpected error occurred/i.test(geometry.body),screen+' rendered an error boundary')
 }
 const find=text=>`[...document.querySelectorAll('button')].findLast(e=>e.textContent.trim()===${JSON.stringify(text)})`
 for(const variant of [{name:'it-dark-360',width:360,lang:'it-IT',theme:'dark'},{name:'en-light-430',width:430,lang:'en',theme:'light'}]){
  for(const screen of auditedScreens){
   try {
   onStep('Screen audit: '+screen+' / '+variant.name)
   if(openPage)({cdp,evaluate,click}=await openPage())
   await cdp('Emulation.setDeviceMetricsOverride',{width:variant.width,height:800,deviceScaleFactor:1,mobile:true})
   await cdp('Page.navigate',{url:'http://127.0.0.1:4174/scripts/ui-simulation/mobile-pages.html?'+new URLSearchParams({screen,lang:variant.lang,theme:variant.theme})})
   await wait(()=>evaluate(`window.__screenAuditReady===${JSON.stringify(screen)}&&!!document.querySelector('button,input,textarea,[role="tab"],details')`),'Production screen did not render: '+screen)
   if(screen==='pdf-viewer'){
    await wait(()=>evaluate(`document.querySelector('[data-testid="pdf-document-viewer"]')?.getAttribute('aria-busy')==='false'`),'Actual PDF rendering did not finish')
    assert.ok(await evaluate(`(()=>{const c=document.querySelector('[data-testid="pdf-document-viewer"] canvas');return c?.width>100&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4!==3&&v<100)})()`),'PDF canvas must contain rendered text')
    const next=variant.lang==='en'?'Next page':'Pagina successiva'
    await click(find(next));await wait(()=>evaluate(`document.querySelector('[data-testid="pdf-document-viewer"]')?.dataset.page==='2'&&document.querySelector('[data-testid="pdf-document-viewer"]').getAttribute('aria-busy')==='false'`),'PDF page navigation did not render page 2')
   }
   if(screen==='knowledge-graph'){
    await click(find(variant.lang==='en'?'Load graph':'Carica il grafo'))
    await wait(()=>evaluate(`document.querySelectorAll('svg [role="button"]').length===2`),'Actual graph data did not load')
    await click(`document.querySelector('svg [role="button"]')`)
   }
   if(screen==='knowledge-evidence')await wait(()=>evaluate(`!!document.querySelector('mark')`),'Source quote did not render')
   if(screen==='knowledge-review'){await click(`document.querySelector('input[role="switch"]')`);await wait(()=>evaluate(`!!document.querySelector('.mantine-Checkbox-input')`),'Source review consent controls did not open')}
   if(screen==='venice-image-settings'){await click(find(variant.lang==='en'?'Venice images':'Immagini Venice'));await click(find(variant.lang==='en'?'Advanced image options':'Opzioni avanzate delle immagini'))}
   if(screen==='web-search')assert.ok(await evaluate(`(()=>{const e=document.querySelector('[data-setting-id="venice-search"]'),label=e.querySelector('.settings-row-label').getBoundingClientRect(),control=e.querySelector('.settings-row-control').getBoundingClientRect();return label.width>=innerWidth*.65&&control.y>=label.bottom-1})()`),'Search engine label must remain readable above its control')
   await capture(screen,variant.name)
   // Scroll each actual scrolling owner to its end; check that the final controls can be reached.
   await evaluate(`(()=>{for(const e of [...document.querySelectorAll('*')])if(e.scrollHeight>e.clientHeight+8&&/auto|scroll/.test(getComputedStyle(e).overflowY))e.scrollTop=e.scrollHeight;window.scrollTo(0,document.body.scrollHeight)})()`)
   await capture(screen+'-bottom',variant.name)
   if(screen==='knowledge-base'){
    const newLabel=variant.lang==='en'?'New collection':'Nuova raccolta',folderLabel=variant.lang==='en'?'Open folder collection':'Apri collezione da cartella'
    const boxes=await evaluate(`(()=>{const texts=${JSON.stringify([newLabel,folderLabel])};return texts.map(text=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text);if(!e)return null;const r=e.getBoundingClientRect(),l=e.querySelector('.mantine-Button-label');return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,labelHeight:(()=>{const range=document.createRange();range.selectNodeContents(l);return range.getBoundingClientRect().height})(),lineHeight:parseFloat(getComputedStyle(l).lineHeight)}})})()`)
    assert.ok(boxes.every(Boolean),'Both native KB actions must be visible')
    assert.ok(boxes.every(b=>b.width>=variant.width-48&&b.height>=44&&b.labelHeight<=2.1*b.lineHeight),'Native actions must be readable and full-width: '+JSON.stringify(boxes))
    assert.ok(boxes[1].y>=boxes[0].bottom+4,'Native KB actions must stack without overlap')
    await click(find(newLabel));await wait(()=>evaluate(`!!document.querySelector('[role="dialog"] input[type="text"]')`),'Create-collection form did not open');await capture('knowledge-create',variant.name)
    await click(`document.querySelector('[role="dialog"] .mantine-CloseButton-root')`)
    await click(find(folderLabel));await wait(()=>evaluate(`!!document.querySelector('[role="dialog"] input[role="switch"]')`),'Connect-folder form did not open');await capture('knowledge-open-folder',variant.name)
    await click(`document.querySelector('[role="dialog"] .mantine-CloseButton-root')`)
    await evaluate(`window.__screenAuditSeed()`)
    await wait(()=>evaluate(`!!(${find(variant.lang==='en'?'Open collection':'Apri raccolta')})`),'Seeded collection did not appear')
    await click(find(variant.lang==='en'?'Open collection':'Apri raccolta'))
    await wait(()=>evaluate(`!!document.querySelector('[data-testid="collection-documents"]')`),'Native-style collection did not open')
    await click(find(variant.lang==='en'?'Read document':'Leggi documento'))
    await wait(()=>evaluate(`document.querySelector('[data-testid="pdf-document-viewer"]')?.getAttribute('aria-busy')==='false'`),'Original KB PDF did not render')
    await capture('knowledge-original-pdf',variant.name)
    await click(find(variant.lang==='en'?'View extracted text':'Vedi testo estratto'))
    await wait(()=>evaluate(`!document.querySelector('[data-testid="pdf-document-viewer"]')&&[...document.querySelectorAll('[role="dialog"]')].some(e=>e.innerText.includes('Enterprise report - page 1'))`),'Extracted document must be a separate view')
    await capture('knowledge-extracted-text',variant.name)
    await click(`[...document.querySelectorAll('[role="dialog"]')].at(-1).querySelector('.mantine-CloseButton-root')`)
    await evaluate(`window.__knowledgePause=true`)
    await click(find(variant.lang==='en'?'Index now':'Indicizza ora'))
    await wait(()=>evaluate(`typeof window.__knowledgeResume==='function'`),'Index request did not start')
    await capture('knowledge-indexing',variant.name)
    await click(`document.querySelector('button[aria-label=${JSON.stringify(variant.lang==='en'?'Back to collections':'Torna alle raccolte')} ]')`)
    await wait(()=>evaluate(`!!(${find(variant.lang==='en'?'Open indexing progress':'Apri avanzamento indicizzazione')})`),'Back cancelled indexing or hid its progress')
    await click(find(variant.lang==='en'?'Open indexing progress':'Apri avanzamento indicizzazione'))
    await evaluate(`window.__knowledgePause=false;window.__knowledgeResume()`)
    await wait(()=>evaluate(`document.querySelector('[data-testid="indexing-status"]')?.innerText.includes(${JSON.stringify(variant.lang==='en'?'Indexed':'Indicizzato')})`),'Index did not resume after navigating Back')
    await capture('knowledge-index-completed',variant.name)
   }
   } catch(error) {const failure={screen,variant:variant.name,error:String(error)};failures.push(failure);await persist();try{failure.state=await evaluate(`({url:location.href,ready:window.__screenAuditReady,body:document.body.innerText,resources:performance.getEntriesByType('resource').length})`);await persist();await screenshot('screen-'+screen+'-failure-'+variant.name)}catch{} }
  }
 }
 // A separate larger-font KB case directly targets Android display/font scaling.
 if(openPage)({cdp,evaluate,click}=await openPage())
 await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true})
 await cdp('Page.navigate',{url:'http://127.0.0.1:4174/scripts/ui-simulation/mobile-pages.html?screen=knowledge-base&lang=it-IT&theme=dark&large=1'})
 await wait(()=>evaluate(`window.__screenAuditReady==='knowledge-base'&&!!document.querySelector('[data-testid="knowledge-overview-actions"]')`),'Large-font native KB did not render')
 await capture('knowledge-base','it-dark-large-text-360')
 await writeFile(path.join(output,'mobile-screen-matrix.json'),JSON.stringify({productionTheme:true,productionSettingsRoute:true,nativeFolderVisible:true,physicalDevice:false,failures,report},null,2))
 assert.deepEqual(failures,[],'Production mobile screen failures')
}
