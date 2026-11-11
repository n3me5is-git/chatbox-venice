import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function runModelPickerReview({ click, evaluate, cdp, wait, byText, byLabel, fill, delay, output }) {
  const report = { imageModels: await evaluate('window.__pickerFixture.imageIds.length'), videoModels: await evaluate('window.__pickerFixture.videoIds.length') }
  assert.ok(report.imageModels >= 70 && report.videoModels >= 140)
  const layouts=await evaluate(`[...document.querySelectorAll('[data-chat-price-review]')].map(row=>{const name=row.querySelector('[data-testid="model-option-name"]'),icons=row.querySelector('[data-model-icons]'),price=row.querySelector('[data-model-cost]');const n=name.getBoundingClientRect(),i=icons.getBoundingClientRect(),p=price.getBoundingClientRect();return {kind:row.dataset.rowKind,nameBottom:n.bottom,iconsTop:i.top,iconsBottom:i.bottom,priceTop:p.top,nameWidth:n.width,rowWidth:row.clientWidth,scrollWidth:row.scrollWidth,nameScroll:name.scrollWidth,nameClient:name.clientWidth,nameOverflow:getComputedStyle(name).textOverflow,nameWhitespace:getComputedStyle(name).whiteSpace}})`)
  assert.equal(layouts.length,2)
  for(const layout of layouts){
    assert.ok(layout.iconsTop>=layout.nameBottom,'Model icons overlap the complete name: '+layout.kind)
    assert.ok(layout.priceTop>=layout.iconsBottom,'Model price is not below its icons: '+layout.kind)
    assert.ok(layout.nameWidth>=layout.rowWidth-32,'Model name did not receive the full row width')
    assert.ok(layout.nameScroll<=layout.nameClient&&layout.scrollWidth<=layout.rowWidth,'Model row overflows horizontally')
    assert.notEqual(layout.nameOverflow,'ellipsis');assert.notEqual(layout.nameWhitespace,'nowrap')
  }
  report.chatPriceOnSeparateLine=true;report.fullWidthNames=true;report.separateCapabilityRow=true;report.narrowAndDesktopRows=true
  await evaluate(`document.querySelector('[data-chat-price-review]').scrollIntoView({block:'start'})`)
  await writeFile(path.join(output,'chat-model-price-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  const modelRow=`document.querySelector('[data-chat-price-review]')`
  await click(`(${modelRow}).querySelector('button[aria-label="Add to favorites"]')`)
  assert.equal(await evaluate('window.__textModelFavorited'),true);assert.equal(await evaluate('window.__textModelSelected'),undefined)
  await evaluate(`(${modelRow}).querySelector('button[aria-label="Add to favorites"]').focus()`)
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  assert.equal(await evaluate('window.__textModelSelected'),undefined,'Keyboard favorite activation selected a model')
  await click(`(${modelRow}).querySelector('button[aria-label="Model details"]')`)
  assert.equal(await evaluate('window.__textModelDetails'),true);assert.equal(await evaluate('window.__textModelSelected'),undefined)
  report.modelActionsPreserved=true
  const chatSpace=()=>evaluate(`document.querySelector('[data-sidebar-chat-space]').clientHeight`),expandedSpace=await chatSpace()
  await click(`document.querySelector('button[aria-label="Collapse tools"]')`)
  await wait(()=>evaluate(`document.querySelector('button[aria-label="Expand tools"]').getAttribute('aria-expanded')==='false'`),'Sidebar tools did not collapse')
  assert.ok(await chatSpace()>expandedSpace+150,'Collapsing tools did not recover space for conversations')
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('ui-store')).state.sidebarToolsCollapsed`),true,'Sidebar preference was not persisted')
  await click(byText('Remount tools group'))
  assert.equal(await evaluate(`document.querySelector('button[aria-label="Expand tools"]').getAttribute('aria-expanded')`),'false','Reopening sidebar forgot the preference')
  await evaluate(`document.querySelector('[data-sidebar-tools-review]').scrollIntoView({block:'start'})`)
  await writeFile(path.join(output,'sidebar-tools-collapsed-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  await click(`document.querySelector('button[aria-label="Expand tools"]')`)
  await wait(()=>evaluate(`document.querySelector('button[aria-label="Collapse tools"]').getAttribute('aria-expanded')==='true'`),'Sidebar tools could not be reopened')
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('ui-store')).state.sidebarToolsCollapsed`),false)
  await writeFile(path.join(output,'sidebar-tools-expanded-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  report.sidebarToolsCollapse=true;report.sidebarSpaceRecovered=true;report.sidebarPreferencePersisted=true;report.sidebarToolsReopened=true
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
  await wait(()=>evaluate(`!${imageList}`),'Previous image picker did not finish closing')
  await click(byText('Test all image providers'))
  await wait(()=>evaluate(`!!${imageList} && (${imageList}).clientHeight>100`),'All-provider picker did not open')
  // Measure only after the opening transition settles; the list moves up from below the viewport.
  let previousBounds
  await wait(async()=>{const next=await evaluate(`(()=>{const r=(${imageList}).getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);const stable=previousBounds&&Math.abs(next.top-previousBounds.top)<0.5&&Math.abs(next.bottom-previousBounds.bottom)<0.5;previousBounds=next;return stable},'All-provider picker did not finish its opening transition')
  const bounds=await evaluate(`(()=>{const e=${imageList},r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,providers:e.querySelectorAll('[data-image-provider]').length}})()`)
  await writeFile(path.join(output,'native-image-picker-bounds.json'),JSON.stringify(bounds,null,2))
  assert.ok(bounds.top>=0&&bounds.bottom<=bounds.height+1,'Native image picker extends outside the mobile viewport: '+JSON.stringify(bounds));assert.equal(bounds.providers,4,'Image provider groups were lost')
  await swipe(imageList);assert.ok(await evaluate(`(${imageList}).scrollTop`)>100,'All-provider image list did not scroll with touch')
  await evaluate(`(${imageList}).parentElement.querySelector('input[aria-label="Search image models"]').focus()`)
  await cdp('Input.insertText',{text:'Custom image provider'})
  await wait(()=>evaluate(`(${imageList}).querySelectorAll('[data-image-provider]').length===1`),'Searching native images by provider did not filter groups')
  await evaluate(`(${imageList}).scrollTop=(${imageList}).scrollHeight`)
  await writeFile(path.join(output,'native-image-providers-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  await click(`(${imageList}).querySelectorAll('button:not([aria-label])').item(84)`)
  await wait(()=>evaluate('window.__nativeImageSelection?.provider==="fixture-2"&&window.__nativeImageSelection?.model==="provider-2-image-84"'),'Last custom-provider image model was not selectable')
  report.nativeProviderGrouping=true;report.nativeViewportBounded=true;report.nativeProviderSearch=true;report.lastCustomProviderSelected=true
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
  await click(byText('Test explicit reference choice'))
  await wait(()=>evaluate('window.__referenceChoice?.id==="reference-choice"'),'Reference control did not open')
  assert.equal(await evaluate('window.__referenceChoice.compatible'),false)
  assert.equal(await evaluate(`(${byText('Generate reference fixture')}).disabled`),true)
  assert.equal(await evaluate(`document.body.textContent.includes('different or undeclared privacy')`),true)
  await click(byText('Choose reference model'))
  await wait(()=>evaluate(`!!document.querySelector('[data-model-scroll="image"]')`),'Reference model picker did not open')
  assert.equal(await evaluate(`document.querySelector('[data-model-scroll="image"]').textContent.includes('Anonymized')`),true)
  assert.equal(await evaluate(`document.querySelector('[data-model-scroll="image"]').textContent.includes('References')&&document.querySelector('[data-model-scroll="image"]').textContent.includes('Image editing')`),true)
  await click(`document.querySelector('[data-model-scroll="image"] button:not([aria-label])')`)
  await wait(()=>evaluate('window.__referenceChoice.id==="reference-choice-edit"'),'Explicit reference selection was lost')
  assert.equal(await evaluate('window.__referenceChoice.automatic'),false)
  await click(byText('Generate reference fixture'));assert.equal(await evaluate('window.__referenceFixtureGenerated'),1)
  await click(byText('Select base model manually'))
  assert.equal(await evaluate('window.__referenceChoice.id'), 'reference-choice')
  assert.equal(await evaluate(`(${byText('Generate reference fixture')}).disabled`),true)
  await click(`document.querySelector('[data-reference-model-control] input[type="checkbox"]').closest('.mantine-Switch-root').querySelector('.mantine-Switch-track')`)
  assert.equal(await evaluate('window.__referenceChoice.automatic'),true)
  assert.equal(await evaluate('window.__referenceChoice.id'),'reference-choice','Automatic selection bypassed the privacy difference')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
  await writeFile(path.join(output,'reference-model-privacy-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  report.referencePrivacyChoice=true;report.manualReferenceSelection=true;report.referenceCapabilityBadges=true
  await click(byText('Close reference choice'))
  await writeFile(path.join(output,'model-picker-report.json'), JSON.stringify(report,null,2))
}
