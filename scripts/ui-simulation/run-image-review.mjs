import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
export async function runImageReview({click,evaluate,wait,byText,byLabel,fill,cdp,output}){
 await click(byText('Test crop and image tools'));await click(byText('Load local crop fixture'));await wait(()=>evaluate('!!window.__originalImageInfo'),'Local reference did not load')
 await click(byText('Verify public Intel quote locally'));await wait(()=>evaluate('!!window.__dcapBrowserVerification||!!window.__dcapBrowserError'),'Browser Intel verification did not finish');assert.equal(await evaluate('window.__dcapBrowserError'),undefined);assert.deepEqual(await evaluate('window.__dcapBrowserVerification'),{status:'UpToDate',tamperRejected:true})
 await click(`[...document.querySelectorAll('button')].findLast(e=>e.textContent.startsWith('Crop reference:'))`)
 await wait(()=>evaluate(`!!document.querySelector('canvas[aria-label="Reference crop area"]')&& !(${byText('Use cropped image')}).disabled`),'Cropper did not decode image')
 await click(`document.querySelector('canvas[aria-label="Reference crop area"]')`)
 const box=await evaluate(`document.querySelector('canvas[aria-label="Reference crop area"]').getBoundingClientRect().toJSON()`)
 await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.5,y:box.y+box.height*.1}]});await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.9,y:box.y+box.height*.9}]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 await wait(()=>evaluate(`Number((${byLabel('Crop width (%)')}).value)<99`),'Touch drag did not change crop')
 await fill('Crop left (%)','50');await fill('Crop top (%)','0');await fill('Crop width (%)','50');await fill('Crop height (%)','100')
 await writeFile(path.join(output,'reference-crop-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 await click(byText('Use cropped image'));await wait(()=>evaluate('window.__croppedImageInfo?.width===256'),'Cropped file was not returned')
 assert.deepEqual(await evaluate('window.__croppedImageInfo'),{width:256,height:256,pixel:[0,0,255,128]});assert.equal(await evaluate('window.__originalImageInfo.width'),512)
 assert.equal(await evaluate('window.__priceQuoteCalls||0'),0);await click(byLabel('Duration for estimate'));await click(`[...document.querySelectorAll('[role="option"]')].findLast(e=>e.textContent==='10 s')`)
 await click(byText('Get current price estimate'));await wait(()=>evaluate('window.__priceQuoteCalls===1'),'Quote did not run');assert.equal(await evaluate('window.__priceQuoteInput.options.duration'),'10s');await wait(()=>evaluate(`document.body.textContent.includes('Average per output second: 0.01 USD')`),'Per-second price was not displayed')
 await click(`document.querySelector('input[aria-label="Compatible gateway receipts"]').closest('.mantine-Switch-root').querySelector('.mantine-Switch-track')`);await wait(()=>evaluate(`document.body.textContent.includes('substituted or replayed')`),'Receipt warning missing');assert.equal(await evaluate('window.__receiptConsent||false'),false)
 await click(byText('Enable compatible receipts'));assert.equal(await evaluate('window.__receiptConsent'),true)
 await click(byText('Load image tool fixture'));assert.equal(await evaluate('window.__imageToolCalls||0'),0);await click(byText('Confirm and remove background'));await wait(()=>evaluate('window.__imageToolSaved===true'),'Processed image was not saved')
 assert.deepEqual(await evaluate('window.__imageToolRequest'),{path:'/api/v1/image/background-remove',scale:null,creativity:null,hasFile:true});assert.equal(await evaluate('window.__imageToolCalls'),1)
 await wait(()=>evaluate(`document.body.textContent.includes('Saved in the local media library')`),'Saved result missing');assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true)
 await writeFile(path.join(output,'image-tools-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:true})).data,'base64'))
}
