import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const output = path.resolve('test-results/venice-ui')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(path.join(tmpdir(), 'venice-ui-'))
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'scripts/ui-simulation/vite.config.ts'], { stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''; vite.stdout.on('data', x => { serverLog += x }); vite.stderr.on('data', x => { serverLog += x })
const chrome = spawn(process.env.CHROME_PATH || '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=9222', '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
let chromeLog = ''; chrome.stderr.on('data', chunk => { chromeLog += chunk });
let browserError; chrome.on('error', error => { browserError = error }); vite.on('error', error => { browserError = error })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(condition, message) {
  const deadline = Date.now() + (message.includes('Chromium') ? 60000 : 25000)
  while (Date.now() < deadline) { if (browserError) throw browserError; try { const value = await condition(); if (value) return value } catch {} await delay(100) }
  throw new Error(message + (message.includes('Chromium') ? ': ' + chromeLog.slice(-3000) : ''))
}
let touchMode = false; let socket; let serial = 0; const pending = new Map(); const exceptions = []; const requests = []
try {
  await wait(async () => (await fetch('http://127.0.0.1:4174/scripts/ui-simulation/')).ok, 'Simulation server did not start')
  const target = await wait(async () => (await (await fetch('http://127.0.0.1:9222/json/list')).json()).find(page => page.type === 'page'), 'Chromium did not start')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = message => {
    const event = JSON.parse(message.data)
    if (event.id) { const task = pending.get(event.id); if (task) { pending.delete(event.id); event.error ? task.reject(new Error(event.error.message)) : task.resolve(event.result) } }
    if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text + ': ' + (event.params.exceptionDetails.exception?.description || ''))
    if (event.method === 'Network.requestWillBeSent') requests.push(event.params.request.url)
  }
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 20000); pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value }
  async function click(expression) {
    let previous
    const box = await wait(async () => {
      const current = await evaluate(`(() => { const e = ${expression}; if (!e) return null; e.scrollIntoView({block:'center',behavior:'instant'}); const r=e.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2; const hit=document.elementFromPoint(x,y); return {x,y,width:r.width,height:r.height,viewport:innerHeight,hit:hit===e||e.contains(hit)} })()`)
      if (!current || !current.width || !current.height || !current.hit || current.y < 0 || current.y >= current.viewport) return false
      const stable = previous && Math.abs(previous.x-current.x) < 0.5 && Math.abs(previous.y-current.y) < 0.5
      previous = current; return stable ? {x:current.x,y:current.y} : false
    }, 'Clickable element did not settle')
    if (touchMode) { await cdp('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[box]}); await cdp('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]}) }
    else { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 }) }
  }
  const byText = text => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`
  const byLabel = label => `document.getElementById([...document.querySelectorAll('label')].findLast(e => e.textContent === ${JSON.stringify(label)}).htmlFor)`
  const fill = async (label, value) => { await evaluate(`(${byLabel(label)}).focus()`); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await cdp('Input.insertText', { text: value }) }
  await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.navigate', { url: 'http://127.0.0.1:4174/scripts/ui-simulation/' })
  await wait(() => evaluate(`document.body.textContent.includes("Your first creation is waiting")`), 'Studio did not render')
  assert.equal(await evaluate('window.__simulationRequestCount || 0'), 0, 'Opening Studio must not contact Venice')
  await click(byText("Load models")); await wait(() => evaluate('window.__simulationRequestCount === 2'), 'Catalog button did not work')
  await wait(() => evaluate(`!!document.querySelector('input[value="Kokoro"]')`), 'Model was not selected')
  await click(byLabel("Voice to use"))
  await click(`[...document.querySelectorAll('[role="option"]')].find(e => e.textContent.trim() === 'Nicola · Italian')`)
  await fill("Text to read", 'Local test without real APIs')
  await click(byText("Generate speech")); await wait(() => evaluate(`!!document.querySelector('audio[aria-label="Generated audio"]')`), 'Generated audio did not appear')
  assert.equal(await evaluate('window.__simulationLastBody.voice'), 'im_nicola', 'Selected voice did not reach the request')
  await click(byText("Export")); await wait(() => evaluate('window.__simulationExport?.size > 0'), 'Export did not receive local audio')
  await evaluate('window.scrollTo(0,0)'); await writeFile(path.join(output, 'desktop.png'), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'))
  await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true })
  touchMode = true; await cdp('Emulation.setTouchEmulationEnabled', {enabled:true}); await delay(250)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'Mobile UI overflows horizontally')
  await writeFile(path.join(output, 'mobile.png'), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'))
  await fill("Text to read", 'SIMULATE_ERROR'); await click(byText("Generate speech"))
  await wait(() => evaluate(`document.body.textContent.includes('HTTP 429')`), 'API error was not shown')
  assert.equal(await evaluate('window.__simulationRequestCount'), 4, 'Failed generation must not be retried')
  await click(byLabel('Audio module enabled (simulation)'))
  assert.equal(await evaluate(`(${byText("Generate speech")}).disabled`), true, 'Disabled module still allows generation')
  await click(`[...document.querySelector('audio').closest('.mantine-Paper-root').querySelectorAll('button')].find(e => e.textContent.trim() === "Delete from device")`); await wait(() => evaluate(`!document.querySelector('audio')`), 'Local deletion did not remove media')
  await click(byText('Test image selection'))
  await wait(() => evaluate(`!!document.querySelector('input[placeholder]') && document.body.textContent.includes("Choose and confirm images")`), 'Image approval did not open')
  assert.equal(await evaluate(`(${byLabel("Venice image model")}).value`), '', 'HITL must choose an unspecified model')
  await click(byLabel("Venice image model")); await click(`[...document.querySelectorAll('[role="option"]')].find(e => e.textContent.trim() === 'GPT Flare')`)
  await click(byLabel("Aspect ratio")); await click(`[...document.querySelectorAll('[role="option"]')].find(e => e.textContent.trim() === '16:9')`)
  await click(byLabel("Content filter")); await click(`[...document.querySelectorAll('[role="option"]')].find(e => e.textContent.trim() === "Off")`)
  await click(byText("Parameters for this call")); await fill("Seed for this generation", '42')
  await click(byLabel('Generation approval for this chat')); await click(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()==='Remember similar generations after approval')`)
  await delay(500)
  await writeFile(path.join(output, 'image-hitl-mobile.png'), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: false })).data, 'base64'))
  await evaluate(`window.__hitlEvents=[]; ['pointerdown','pointerup','click'].forEach(type => document.addEventListener(type, e => window.__hitlEvents.push({type,text:e.target.textContent?.slice(0,100),tag:e.target.tagName,x:e.clientX,y:e.clientY}),true))`)
  try { await click(byText("Confirm and generate")); await wait(() => evaluate('!!window.__simulationImageChoice'), 'HITL did not return the approved request') }
  catch (error) {
    await writeFile(path.join(output, 'image-hitl-failure.png'), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: false })).data, 'base64'))
    const diagnostic = await evaluate(`({events:window.__hitlEvents,body:document.body.innerText,active:document.activeElement?.outerHTML,buttons:[...document.querySelectorAll('button')].filter(e=>e.textContent.includes('Confirm and generate')).map(e=>({html:e.outerHTML,rect:e.getBoundingClientRect().toJSON()}))})`)
    await writeFile(path.join(output, 'image-hitl-diagnostic.json'), JSON.stringify(diagnostic,null,2)); throw new Error(error.message + ': ' + JSON.stringify(diagnostic))
  }
  assert.equal(await evaluate('window.__simulationImageChoice.modelId'), 'gpt-flare-image'); assert.equal(await evaluate('window.__simulationImageChoice.aspectRatio'), '16:9'); assert.equal(await evaluate('window.__simulationImageChoice.extraBody.seed'), 42); assert.equal(await evaluate('window.__simulationImageChoice.extraBody.safe_mode'), false)
  assert.equal(await evaluate('window.__simulationImageAutomatic'),false)
  await click(byText('Test image selection')); await wait(()=>evaluate('window.__simulationImageAutomatic === true'),'Similar image generation was not approved automatically')
  assert.equal(await evaluate('window.__simulationImageDialogs'),1); assert.equal(await evaluate('window.__simulationImageChoice.prompt'),'Another sunset with different colors'); assert.equal(await evaluate('window.__simulationImageChoice.extraBody.seed'),42)
  assert.equal(await evaluate('window.__simulationOtherChatMode'),'ask')
  await evaluate("window.__simulationSetLanguage('it-IT')"); await wait(()=>evaluate("document.body.textContent.includes('Azzera le approvazioni di questa chat')"),'Live Italian translation did not appear')
  await evaluate("window.__simulationSetLanguage('en')"); await click(byText('Reset approvals for this chat')); await click(byText('Test image selection'))
  await wait(()=>evaluate("document.body.textContent.includes('Choose and confirm images')"),'Reset did not restore human approval')
  assert.equal(await evaluate(`(${byLabel('Venice image model')}).value`),''); await click(byText('Cancel'))
  assert.equal(await evaluate('window.__simulationRequestCount'), 4, 'The HITL fixture must not call paid APIs')
  assert.deepEqual(exceptions, [], 'Browser exceptions')
  const external = requests.filter(url => !/^(http:\/\/127\.0\.0\.1:4174\/|data:|blob:)/.test(url))
  assert.deepEqual(external, [], 'UI simulation made an unexpected external request')
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ passed: true, viewports: ['1440x1100', '412x915'], assertions: ['no automatic API calls', 'load catalog', 'choose a live model voice', 'generate audio', 'export local media', 'show error without retry', 'disable module', 'delete local media', 'no horizontal mobile overflow', 'image HITL selection', 'per-call moderation and seed approval', 'similar generation approval', 'chat approval isolation', 'approval reset', 'live language change', 'no browser exceptions', 'no external requests'], requests: await evaluate('window.__simulationRequestCount'), exceptions }, null, 2))
  console.log('Venice Studio browser simulation passed; desktop/mobile screenshots saved.')
} finally {
  socket?.close(); chrome.kill('SIGTERM'); vite.kill('SIGTERM'); await writeFile(path.join(output, 'vite.log'), serverLog); await writeFile(path.join(output, 'chrome.log'), chromeLog)
}
