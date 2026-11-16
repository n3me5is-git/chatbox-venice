import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function runKnowledgeMobileUx({ click, evaluate, wait, fill, cdp, output }) {
  const tab = name => `[...document.querySelectorAll('[role="tab"]')].findLast(e=>e.textContent===${JSON.stringify(name)})`
  const button = name => `[...document.querySelectorAll('button')].findLast(e=>e.textContent===${JSON.stringify(name)})`
  const requests = await evaluate('window.__knowledgeRequests()'), report = []
  for (const width of [360, 390, 430]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 1, mobile: true })
    await click(tab('Documents'))
    await wait(() => evaluate(`!!document.querySelector('[data-testid="collection-documents"]')`), 'Document view missing')
    const geometry = await evaluate(`(()=>{const panel=document.querySelector('[data-testid="collection-documents"]');return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons:[...panel.querySelectorAll('button,label.mantine-Button-root')].filter(e=>e.getClientRects().length).map(e=>({name:e.textContent||e.getAttribute('aria-label'),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}))}})()`)
    assert.ok(geometry.scrollWidth <= width, 'Knowledge documents overflow at ' + width)
    assert.ok(geometry.buttons.every(b => b.height >= 43.5 && b.width >= 43.5), 'Small document touch target at ' + width)
    await writeFile(path.join(output, `knowledge-documents-${width}.png`), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: false })).data, 'base64'))
    await click(tab('Settings'))
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 420, deviceScaleFactor: 1, mobile: true })
    await fill('Collection name', 'Local manuals draft')
    await click(tab('Documents')); await click(tab('Settings'))
    assert.equal(await evaluate(`document.querySelector('input[value="Local manuals draft"]')!==null`), true, 'Settings draft lost while switching tabs')
    await fill('Collection name', 'Local manuals')
    await click(button('Document processing'))
    await click(`[...document.querySelectorAll('label')].findLast(e=>e.textContent==='Optional OCR for images and scanned PDFs')`)
    await wait(() => evaluate(`!![...document.querySelectorAll('label')].find(e=>e.textContent==='Read all PDF pages with OCR')`), 'OCR options missing from expanded settings')
    await click(`[...document.querySelectorAll('label')].findLast(e=>e.textContent==='Read all PDF pages with OCR')`)
    await click(`[...document.querySelectorAll('label')].findLast(e=>e.textContent==='Read all PDF pages with OCR')`)
    await click(`[...document.querySelectorAll('label')].findLast(e=>e.textContent==='Optional OCR for images and scanned PDFs')`)
    await click(`[...document.querySelectorAll('label')].findLast(e=>e.textContent.startsWith('I allow the selected embedding/'))`)
    await click(button('Save settings'))
    await wait(() => evaluate(`!document.body.textContent.includes('You have unsaved changes.')`), 'Saved settings remained dirty')
    assert.equal(await evaluate('window.__knowledgeRequests()'), requests, 'Browsing/saving KB settings initiated inference')
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'Settings overflow with keyboard-sized viewport')
    await writeFile(path.join(output, `knowledge-settings-keyboard-${width}.png`), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: false })).data, 'base64'))
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 1, mobile: true })
    await click(tab('Documents'))
    report.push({ width, keyboardHeight: 420, minimumTouchTarget: 44, draftRetained: true, noImplicitInference: true, horizontalOverflow: false })
  }
  await fill('Filter collection documents', 'enterprise-060')
  await wait(() => evaluate(`document.querySelectorAll('[data-testid="collection-documents"] button[aria-label^="Document actions"]').length===1`), 'Document filter did not narrow the list')
  await click(`document.querySelector('[aria-label^="Document actions for enterprise-060"]')`)
  await click(button('Preview passages'))
  await wait(() => evaluate(`document.body.textContent.includes('Synthetic enterprise source 60')`), 'Document action menu did not open the chosen source')
  await click(`[...document.querySelectorAll('[role="dialog"]')].at(-1).querySelector('button[aria-label="Close" i]')`)
  await fill('Filter collection documents', '')
  await click(button('Next page'))
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid="collection-documents"] button[aria-label^="Document actions"]').length`), 11, 'The second document page was inaccessible')
  await evaluate(`window.__simulationSetLanguage('it-IT')`)
  await wait(() => evaluate(`!![...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='Documenti')`), 'Italian KB navigation missing')
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'Italian document controls overflow')
  await writeFile(path.join(output, 'knowledge-documents-italian.png'), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: false })).data, 'base64'))
  await evaluate(`window.__simulationSetLanguage('en')`)
  await wait(() => evaluate(`!![...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent==='Documents')`), 'English KB navigation missing')
  await writeFile(path.join(output, 'knowledge-mobile-ux.json'), JSON.stringify({ report, documents: 61, pagination: true, longNameMenu: true, languages: ['en', 'it-IT'] }, null, 2))
}
