import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
export async function runAgentMobileReview({ click, evaluate, wait, fill, byText, cdp, output }) {
  await click(byText('Test mobile agent editor'))
  await click(byText('Create agent manually'))
  await fill('Agent title', 'A synthetic enterprise document worker with a deliberately long title')
  await fill('Worker instructions', 'Read only the context explicitly shared by the caller. Produce a concise report.')
  const report = []
  for (const width of [360, 430]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 420, deviceScaleFactor: 1, mobile: true })
    await click(byText('Tools and runtime options'))
    const label = `[...document.querySelectorAll('label')].findLast(e=>e.textContent==='May spawn on-demand workers')`
    await click(label); await click(label)
    await click(byText('Tools and runtime options'))
    const guardian = `[...document.querySelectorAll('label')].findLast(e=>e.textContent==='Enable a guardian for this worker')`
    await click(guardian)
    await wait(() => evaluate(`!![...document.querySelectorAll('label')].find(e=>e.textContent==='Guardian policy')`), 'Guardian settings were not revealed')
    await click(guardian)
    await wait(() => evaluate(`![...document.querySelectorAll('label')].some(e=>e.textContent==='Guardian policy'&&e.getClientRects().length)`), 'Disabled guardian still occupied the form')
    await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent==='Save agent');e.scrollIntoView({block:'center'})})()`)
    await wait(() => evaluate(`document.getAnimations().every(animation=>animation.playState!=='running'||animation.effect?.getTiming().iterations===Infinity)`), 'Agent editor transitions did not settle')
    const geometry = await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent==='Save agent'),r=e.getBoundingClientRect();return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:r.height,bottom:r.bottom,viewport:innerHeight}})()`)
    assert.ok(geometry.scrollWidth <= width, 'Agent editor overflows horizontally')
    assert.ok(geometry.height >= 43.5 && geometry.bottom <= geometry.viewport, 'Agent save action is inaccessible with a keyboard-sized viewport')
    await writeFile(path.join(output, `agent-editor-keyboard-${width}.png`), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: false })).data, 'base64'))
    report.push(geometry)
  }
  await click(`[...document.querySelectorAll('[role="dialog"]')].at(-1).querySelector('button[aria-label="Close" i]')`)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true })
  await writeFile(path.join(output, 'agent-mobile-ux.json'), JSON.stringify({ report, manualDraftOnly: true, generatedContent: false }, null, 2))
}
