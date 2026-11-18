import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
export async function runMobileReview({click,evaluate,cdp,wait,byText,byLabel,fill,delay,output}){
 const originalURL=await evaluate('location.href')
 await click(byText('Test reported mobile issues'));await wait(()=>evaluate(`!!document.querySelector('input[value="No project lock"]')`),'Production project control did not open')
 await click(byLabel('Project protection'));await click(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent==='Use a dedicated project PIN')`)
 assert.equal(await evaluate('window.__simulationProjectMode'),'pin','Touch selection did not persist the dedicated project PIN mode')
 await click(byLabel('Project protection'));await evaluate('window.__simulationBack()');await wait(()=>evaluate(`![...document.querySelectorAll('[role="option"]')].some(e=>e.getClientRects().length)`),'Back did not close the project dropdown');assert.equal(await evaluate(`!!(${byLabel('Project protection')})`),true,'Back closed the parent panel')
 await click(byLabel('Catalog model'));await wait(()=>evaluate(`!![...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('E2EE capable')&&e.textContent.includes('Private')&&e.textContent.includes('Uncensored'))`),'Catalog options omitted privacy/E2EE/filter badges')
 await click(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('Anonymous image model'))`)
 await wait(()=>evaluate(`(${byLabel('Catalog model')}).value==='Anonymous image model'`),'Touch model selection did not commit')
 await click(byLabel('Catalog model'));await click(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('Private secure model'))`)
 await wait(()=>evaluate(`(${byLabel('Catalog model')}).value==='Private secure model'`),'The second model selection did not commit')
 await fill('Paid image prompt','First line')
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
 assert.equal(await evaluate(`(${byLabel('Paid image prompt')}).value`),'First line\n','Enter did not insert a newline')
 assert.equal(await evaluate('window.__simulationExplicitImages||0'),0,'Enter started a paid image generation')
 await click(byText('Explicit image generation'));assert.equal(await evaluate('window.__simulationExplicitImages'),1)
 await click(byText('Model details and options'));await wait(()=>evaluate(`document.body.textContent.includes('Input / 1M tokens')`),'Readable pricing did not open')
 assert.equal(await evaluate('window.__simulationBack()'),true);await wait(()=>evaluate(`!document.body.textContent.includes('Technical catalog data')`),'Back did not close the top model details');assert.equal(await evaluate(`!!(${byLabel('Project protection')})`),true)
 const target=`[...document.querySelectorAll('button')].findLast(e=>e.getAttribute('aria-label')==='Preview History context action test')`
 // The preceding model drawer can still be animating after its text disappears.
 // Use the shared visibility/hit-test gate before measuring the real long press.
 await click(target)
 let priorPoint
 const p=await wait(async()=>{const point=await evaluate(`(async()=>{const e=${target};if(!e)return null;e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return r.width&&r.height&&(hit===e||e.contains(hit))?{x,y}:null})()`);const stable=point&&priorPoint&&Math.abs(point.x-priorPoint.x)<.5&&Math.abs(point.y-priorPoint.y)<.5;priorPoint=point;return stable?point:false},'History long-press target did not settle')
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await delay(700);await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 const historyPanel=`[...document.querySelectorAll('[role="dialog"]')].findLast(e=>e.textContent.includes('Bottom of scrollable panel'))`
 const historyMenu=`[...(${historyPanel})?.querySelectorAll('[role="menu"]')||[]].some(e=>e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'&&e.textContent.includes('Protect this creation'))&&!!(${historyPanel})?.querySelector('[aria-label="Creation actions"][aria-expanded="true"]')`
 // The same label exists in other Studio cards; require this panel's visible menu.
 await wait(()=>evaluate(historyMenu),'Long press did not expose this history protection menu')
 await evaluate(`Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))`)
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
 await evaluate(`Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))`)
 await wait(()=>evaluate(`!!(${historyPanel})&&(${historyPanel}).getBoundingClientRect().height>0&&!(${historyMenu})`),'Escape must close the history menu while keeping its parent panel open')
 const body=`(${historyPanel})?.querySelector('.mantine-Drawer-body')`
 // Start inside the content, not on Chromium's native scrollbar gutter.
 const point=await wait(()=>evaluate(`(async()=>{const e=${body};if(!e)return null;e.scrollTop=0;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=e.getBoundingClientRect(),top=Math.max(0,r.top)+20,bottom=Math.min(innerHeight,r.bottom)-20,x=r.left+e.clientWidth/2,y=top+(bottom-top)*.8,hit=document.elementFromPoint(x,y);return bottom>top&&(hit===e||e.contains(hit))?{x,y,distance:Math.min(450,(bottom-top)*.6),hit:hit?.outerHTML}:null})()`),'Touch scrolling must start inside the visible history panel')
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]})
 for(let step=1;step<=10;step++){await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-point.distance*step/10}]});await delay(35)}
 await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(500)
 await writeFile(path.join(output,'touch-scroll-metrics.json'),JSON.stringify({point,...await evaluate(`({body:(()=>{const e=${body};return e?{height:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop}:null})(),ancestors:(()=>{const a=[];for(let e=${body};e;e=e.parentElement){const s=getComputedStyle(e);a.push({tag:e.tagName,class:e.className,touchAction:s.touchAction,overflow:s.overflow})}return a})(),active:document.activeElement?.outerHTML})`)},null,2))
 assert.equal(await evaluate(`(${body})?.scrollTop>100`),true,'The settings panel did not remain open and scroll vertically with touch')
 await writeFile(path.join(output,'reported-mobile-panels.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 await click(byText('Close reported issues'));await wait(()=>evaluate(`!document.body.textContent.includes('Bottom of scrollable panel')`),'Reported issues panel did not close')
 await click(byText('Test visual library'));await wait(()=>evaluate(`!!document.querySelector('[aria-label="Preview Local orange landscape"]')`),'Encrypted local image missing from visual library')
 await click(`document.querySelector('[aria-label="Preview Local orange landscape"]')`);await wait(()=>evaluate(`!!document.querySelector('img[alt="Local orange landscape"]')`),'Library image preview did not show local pixels')
 assert.equal(await evaluate('window.__simulationBack()'),true);await wait(()=>evaluate(`!document.querySelector('img[alt="Local orange landscape"]')`),'Back did not close the library preview')
 const category=label=>`[...document.querySelectorAll('label')].findLast(e=>e.textContent===${JSON.stringify(label)})`
 await click(category('Music'));await wait(()=>evaluate(`document.body.textContent.includes('Local music sample')&&!document.querySelector('[aria-label="Preview Local orange landscape"]')`),'Music category did not filter the library')
 await click(category('Images'));await wait(()=>evaluate(`!!document.querySelector('[aria-label="Preview Local orange landscape"]')`),'Images category did not return the image')
 await click(`document.querySelector('[aria-label="Creation actions"]')`)
 assert.equal(await evaluate('window.__simulationBack()'),true)
 await wait(()=>evaluate(`![...document.querySelectorAll('[role="menu"]')].some(e=>e.getClientRects().length)`),'Back did not close library actions before the library panel')
 assert.equal(await evaluate(`!!document.querySelector('[aria-label="Preview Local orange landscape"]')`),true,'Back from library actions closed the whole library')
 await click(`document.querySelector('[aria-label="Creation actions"]')`);await click(byText('Protect this creation'))
 await wait(()=>evaluate(`!!document.querySelector('input[autocomplete="current-password"]')`),'Protecting a public library item did not request an unlock')
 await fill('PIN or passphrase','123456');await click(byText('Unlock'));await wait(()=>evaluate(`!document.querySelector('[aria-label="Preview Local orange landscape"]')`),'Protected image stayed in the public library')
 await click(category('Protected library'));await wait(()=>evaluate(`!!document.querySelector('input[autocomplete="current-password"]')`),'Entering the protected library did not ask for authentication')
 await fill('PIN or passphrase','123456');await click(byText('Unlock'));await wait(()=>evaluate(`!!document.querySelector('[aria-label="Preview Local orange landscape"]')&&!document.querySelector('input[autocomplete="current-password"]')`),'Protected library did not replace the unlock form with unlocked content')
 await writeFile(path.join(output,'visual-library-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 assert.equal(await evaluate('window.__simulationBack()'),true);await wait(()=>evaluate(`!document.body.textContent.includes('Visual library regression')`),'Back did not close the library panel')
 assert.equal(await evaluate('location.href'),originalURL,'Panel back navigation changed the app route')
}
