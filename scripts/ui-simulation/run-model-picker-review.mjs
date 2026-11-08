import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function runModelPickerReview({ click, evaluate, cdp, wait, byText, byLabel, fill, delay, output }) {
  const report = { imageModels: await evaluate('window.__pickerFixture.imageIds.length'), videoModels: await evaluate('window.__pickerFixture.videoIds.length') }
  assert.ok(report.imageModels >= 70 && report.videoModels >= 140)
  const priceLayout=await evaluate(`(()=>{const row=document.querySelector('[data-chat-price-review]'),name=[...row.querySelectorAll('span')].find(e=>e.textContent==='Long chat model name for pricing review'),price=[...row.querySelectorAll('span')].find(e=>e.textContent.includes('1M tokens'));return {nameBottom:name.getBoundingClientRect().bottom,priceTop:price.getBoundingClientRect().top,rowWidth:row.clientWidth,scrollWidth:row.scrollWidth}})()`)
  assert.ok(priceLayout.priceTop>=priceLayout.nameBottom,'Chat model price did not start on its own line')
  assert.ok(priceLayout.scrollWidth<=priceLayout.rowWidth,'Chat model price row overflowed horizontally')
  report.chatPriceOnSeparateLine=true
  await evaluate(`document.querySelector('[data-chat-price-review]').scrollIntoView({block:'start'})`)
  await writeFile(path.join(output,'chat-model-price-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  async function swipe(selector) {
    let previous
    const p = await wait(async () => {
      const current = await evaluate(`(() => { const e=${selector}; if(!e)return null; const r=e.getBoundingClientRect(); const height=Math.min(r.height,innerHeight-r.y),x=r.x+e.clientWidth/2,y=r.y+height*0.85; return {x,y,height,distance:height*0.65,hit:e.contains(document.elementFromPoint(x,y))} })()`)
      if(!current || current.height<160 || !current.hit)return false
      const stable=previous&&Math.abs(current.y-previous.y)<0.5
      previous=current
      return stable?current:false
    }, 'Scrollable model list did not finish opening')
    await cdp('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:p.x,y:p.y}] })
    for (let i=1;i<=8;i++) { await cdp('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:p.x,y:p.y-p.distance*i/8}]}); await delay(25) }
    await cdp('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]}); await delay(150)
  }
  await click(byText('Test long image model list'))
  const imageList = `document.querySelector('[data-model-scroll="image"]')`
  await wait(() => evaluate(`!!${imageList} && (${imageList}).clientHeight>100`), 'Image model drawer did not open')
  assert.equal(await evaluate(`(${imageList}).scrollHeight > (${imageList}).clientHeight`), true)
  await swipe(imageList)
  assert.ok(await evaluate(`(${imageList}).scrollTop`) > 100, 'Image model list did not scroll with a finger')
  report.imageTouchScroll = true
  // Move the scrollbar to the end, then tap the real last row and its information action.
  await evaluate(`(${imageList}).scrollTop=(${imageList}).scrollHeight`)
  await click(`(${imageList}).querySelectorAll('button[aria-label="Model details"]').item(window.__pickerFixture.imageIds.length-1)`)
  await wait(() => evaluate(`document.body.textContent.includes('Technical catalog data')`), 'Last image model info is unavailable without a description')
  assert.equal(await evaluate('window.__longImageSelection'), undefined, 'Information must not change the selected model')
  report.imageDetailsWithoutDescription = true
  await writeFile(path.join(output,'long-image-model-info.png'), Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  await evaluate('window.__simulationBack()')
  await wait(() => evaluate(`!document.body.textContent.includes('Technical catalog data')`), 'Image details did not close')
  await click(`(${imageList}).querySelectorAll('button:not([aria-label])').item(window.__pickerFixture.imageIds.length-1)`)
  await wait(() => evaluate('window.__longImageSelection===window.__pickerFixture.imageIds.at(-1)'), 'The last image model could not be selected')
  report.lastImageSelected = true
  await click(byText('Test long Studio model list'))
  await wait(() => evaluate(`document.body.textContent.includes('Long Studio catalog regression')`), 'Studio fixture did not open')
  await click(byLabel('Model'))
  const studioList = `document.querySelector('[data-model-scroll="venice"]')`
  await wait(() => evaluate(`!!${studioList}`), 'Studio mobile model picker did not open')
  await swipe(studioList)
  assert.ok(await evaluate(`(${studioList}).scrollTop`) > 100, 'Studio model list did not scroll with a finger')
  report.studioTouchScroll = true
  await fill('Search','seedance-2-0-')
  await wait(() => evaluate(`(${studioList}).querySelectorAll('[role="option"]').length>=3`), 'Searching by API ID failed')
  assert.equal(await evaluate(`(${studioList}).textContent.includes('Text to video')&&(${studioList}).textContent.includes('Image to video')&&(${studioList}).textContent.includes('References to video')`), true, 'Repeated Seedance names omitted the variant')
  await click(`(${studioList}).querySelector('button[aria-label^="Model details:"]')`)
  await wait(() => evaluate(`document.body.textContent.includes('Options allowed by the catalog')`), 'Info from a Studio option did not open')
  assert.equal(await evaluate(`document.body.textContent.includes('Filter not declared')`), true, 'Unknown filtering status must stay unknown')
  report.variantAndPrivacyDetails = true
  await writeFile(path.join(output,'long-studio-model-info.png'), Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  await evaluate('window.__simulationBack()')
  await wait(() => evaluate(`!document.body.textContent.includes('Technical catalog data')`), 'Studio information did not close')
  assert.equal(await evaluate(`!!${studioList}`), true, 'Back from model info closed the model list')
  await fill('Search','')
  await evaluate(`(${studioList}).scrollTop=(${studioList}).scrollHeight`)
  await click(`(${studioList}).querySelectorAll('[role="option"]').item(window.__pickerFixture.videoIds.length-1).querySelector('button')`)
  await wait(() => evaluate(`!${studioList}`), 'Studio selection did not close the picker')
  const expected=await evaluate('window.__pickerFixture.videoIds.at(-1)')
  await click(byText('Model details and options'))
  await wait(() => evaluate(`document.body.textContent.includes(${JSON.stringify(expected)})&&document.body.textContent.includes('Technical catalog data')`), 'The last Studio model was not selected')
  report.lastStudioSelected = true
  await evaluate('window.__simulationBack()')
  for (const [workflow,label] of [['text','Text to video'],['image','Image to video'],['references','References to video'],['edit','Video editing']]) {
    await click(byLabel('What would you like to do?'))
    await click(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent===${JSON.stringify(label)})`)
    await click(byLabel('Model'))
    await wait(()=>evaluate(`!!${studioList}`),'Filtered model list did not open')
    const ids=await evaluate(`[...(${studioList}).querySelectorAll('[data-model-id]')].map(e=>e.dataset.modelId)`)
    assert.deepEqual(ids,await evaluate(`window.__pickerFixture.workflows[${JSON.stringify(workflow)}]`),'The workflow filter offered an incompatible variant')
    await evaluate('window.__simulationBack()')
  }
  report.workflowFiltering = true
  await click(byText('Close Studio model test'))
  await wait(() => evaluate(`!document.body.textContent.includes('Long Studio catalog regression')`), 'Studio fixture did not close')
  await writeFile(path.join(output,'model-picker-report.json'), JSON.stringify(report,null,2))
}
