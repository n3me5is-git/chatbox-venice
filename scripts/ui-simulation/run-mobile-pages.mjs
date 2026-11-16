import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'

export const auditedScreens=['knowledge-base','knowledge-models','knowledge-intelligence','knowledge-review','venice-search','venice-image-settings','venice-modules','venice-profile','subscription','web-search','chat-privacy','e2ee-tools','receipts','approvals','questions','generation-failure','multi-agent-settings','agent-calling-details','agent-transcript','security','library-settings','archive-storage','collaboration','transfer','mcp-session','mcp-application']

export async function runMobilePages({cdp,evaluate,click,wait,output}){
 const report=[],failures=[]
 const screenshot=async name=>{await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);await writeFile(path.join(output,name+'.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))}
 const capture=async(screen,variant)=>{
  await evaluate(`Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))`)
  const geometry=await evaluate(`(()=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';const buttons=[...document.querySelectorAll('button')].filter(visible).map(e=>{const r=e.getBoundingClientRect(),l=e.querySelector('.mantine-Button-label');return {text:e.textContent||e.getAttribute('aria-label'),width:r.width,height:r.height,labelHeight:l?.getBoundingClientRect().height,lineHeight:l?parseFloat(getComputedStyle(l).lineHeight):null,clipped:l?l.scrollWidth>l.clientWidth+1:false}});return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons,body:document.body.innerText}})()`)
  await screenshot('screen-'+screen+'-'+variant)
  report.push({screen,variant,...geometry})
  assert.ok(geometry.scrollWidth<=geometry.viewport+1,screen+' overflows horizontally: '+JSON.stringify(geometry))
  const compressed=geometry.buttons.filter(b=>b.text?.trim()&&b.labelHeight>3.1*b.lineHeight)
  assert.deepEqual(compressed,[],screen+' has buttons with crushed labels')
  assert.ok(!/Something went wrong|An unexpected error occurred/i.test(geometry.body),screen+' rendered an error boundary')
 }
 const find=text=>`[...document.querySelectorAll('button')].findLast(e=>e.textContent.trim()===${JSON.stringify(text)})`
 for(const variant of [{name:'it-dark-360',width:360,lang:'it-IT',theme:'dark'},{name:'en-light-430',width:430,lang:'en',theme:'light'}]){
  await cdp('Emulation.setDeviceMetricsOverride',{width:variant.width,height:800,deviceScaleFactor:1,mobile:true})
  for(const screen of auditedScreens){
   try {
   await cdp('Page.navigate',{url:'http://127.0.0.1:4174/scripts/ui-simulation/mobile-pages.html?'+new URLSearchParams({screen,lang:variant.lang,theme:variant.theme})})
   await wait(()=>evaluate(`window.__screenAuditReady===${JSON.stringify(screen)}&&!!document.querySelector('button,input,textarea,[role="tab"],details')`),'Production screen did not render: '+screen)
   await capture(screen,variant.name)
   // Scroll each actual scrolling owner to its end; check that the final controls can be reached.
   await evaluate(`(()=>{for(const e of [...document.querySelectorAll('*')])if(e.scrollHeight>e.clientHeight+8&&/auto|scroll/.test(getComputedStyle(e).overflowY))e.scrollTop=e.scrollHeight;window.scrollTo(0,document.body.scrollHeight)})()`)
   await capture(screen+'-bottom',variant.name)
   if(screen==='knowledge-base'){
    const newLabel=variant.lang==='en'?'New collection':'Nuova raccolta',folderLabel=variant.lang==='en'?'Open folder collection':'Apri collezione da cartella'
    const boxes=await evaluate(`(()=>{const texts=${JSON.stringify([newLabel,folderLabel])};return texts.map(text=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===text);if(!e)return null;const r=e.getBoundingClientRect(),l=e.querySelector('.mantine-Button-label');return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,labelHeight:l.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(l).lineHeight)}})})()`)
    assert.ok(boxes.every(Boolean),'Both native KB actions must be visible')
    assert.ok(boxes.every(b=>b.width>=variant.width-48&&b.height>=44&&b.labelHeight<=2.1*b.lineHeight),'Native actions must be readable and full-width: '+JSON.stringify(boxes))
    assert.ok(boxes[1].y>=boxes[0].bottom+4,'Native KB actions must stack without overlap')
    await click(find(newLabel));await capture('knowledge-create',variant.name)
    await click(`document.querySelector('[role="dialog"] button[aria-label="Close" i]')`)
    await click(find(folderLabel));await capture('knowledge-open-folder',variant.name)
    await click(`document.querySelector('[role="dialog"] button[aria-label="Close" i]')`)
   }
   } catch(error) {failures.push({screen,variant:variant.name,error:String(error)});await screenshot('screen-'+screen+'-failure-'+variant.name)}
  }
 }
 // A separate larger-font KB case directly targets Android display/font scaling.
 await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true})
 await cdp('Page.navigate',{url:'http://127.0.0.1:4174/scripts/ui-simulation/mobile-pages.html?screen=knowledge-base&lang=it-IT&theme=dark&large=1'})
 await wait(()=>evaluate(`window.__screenAuditReady==='knowledge-base'&&!!document.querySelector('[data-testid="knowledge-overview-actions"]')`),'Large-font native KB did not render')
 await capture('knowledge-base','it-dark-large-text-360')
 await writeFile(path.join(output,'mobile-screen-matrix.json'),JSON.stringify({productionTheme:true,productionSettingsRoute:true,nativeFolderVisible:true,physicalDevice:false,failures,report},null,2))
 assert.deepEqual(failures,[],'Production mobile screen failures')
}
