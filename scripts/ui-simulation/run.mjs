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
const chrome = spawn(process.env.CHROME_PATH || '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=9222', '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' })
let browserError; chrome.on('error', error => { browserError = error }); vite.on('error', error => { browserError = error })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(condition, message) {
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) { if (browserError) throw browserError; try { const value = await condition(); if (value) return value } catch {} await delay(100) }
  throw new Error(message)
}
let socket; let serial = 0; const pending = new Map(); const exceptions = []; const requests = []
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
    const box = await evaluate(`(() => { const e = ${expression}; if (!e) throw new Error('Missing element'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...box, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...box, button: 'left', clickCount: 1 })
  }
  const byText = text => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`
  const byLabel = label => `document.getElementById([...document.querySelectorAll('label')].find(e => e.textContent === ${JSON.stringify(label)}).htmlFor)`
  const fill = async (label, value) => { await evaluate(`(${byLabel(label)}).focus()`); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 }); await cdp('Input.insertText', { text: value }) }
  await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.navigate', { url: 'http://127.0.0.1:4174/scripts/ui-simulation/' })
  await wait(() => evaluate(`document.body.textContent.includes('La tua prima creazione ti aspetta')`), 'Studio did not render')
  assert.equal(await evaluate('window.__simulationRequestCount || 0'), 0, 'Opening Studio must not contact Venice')
  await click(byText('Carica modelli')); await wait(() => evaluate('window.__simulationRequestCount === 2'), 'Catalog button did not work')
  await wait(() => evaluate(`!!document.querySelector('input[value="Kokoro"]')`), 'Model was not selected')
  await click(byLabel('Voce'))
  await click(`[...document.querySelectorAll('[role="option"]')].find(e => e.textContent.trim() === 'Nicola · Italiano')`)
  await fill('Testo da leggere', 'Prova locale senza API reali')
  await click(byText('Genera voce')); await wait(() => evaluate(`!!document.querySelector('audio[aria-label="Audio generato"]')`), 'Generated audio did not appear')
  assert.equal(await evaluate('window.__simulationLastBody.voice'), 'im_nicola', 'Selected voice did not reach the request')
  await click(byText('Esporta')); await wait(() => evaluate('window.__simulationExport?.size > 0'), 'Export did not receive local audio')
  await evaluate('window.scrollTo(0,0)'); await writeFile(path.join(output, 'desktop.png'), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'))
  await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true })
  await delay(250)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'Mobile UI overflows horizontally')
  await writeFile(path.join(output, 'mobile.png'), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: true })).data, 'base64'))
  await fill('Testo da leggere', 'SIMULATE_ERROR'); await click(byText('Genera voce'))
  await wait(() => evaluate(`document.body.textContent.includes('HTTP 429')`), 'API error was not shown')
  assert.equal(await evaluate('window.__simulationRequestCount'), 4, 'Failed generation must not be retried')
  await click(byLabel('Modulo audio attivo (simulazione)'))
  assert.equal(await evaluate(`(${byText('Genera voce')}).disabled`), true, 'Disabled module still allows generation')
  await click(`[...document.querySelector('audio').closest('.mantine-Paper-root').querySelectorAll('button')].find(e => e.textContent.trim() === 'Elimina dal dispositivo')`); await wait(() => evaluate(`!document.querySelector('audio')`), 'Local deletion did not remove media')
  assert.deepEqual(exceptions, [], 'Browser exceptions')
  const external = requests.filter(url => !/^(http:\/\/127\.0\.0\.1:4174\/|data:|blob:)/.test(url))
  assert.deepEqual(external, [], 'UI simulation made an unexpected external request')
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ passed: true, viewports: ['1440x1100', '412x915'], assertions: ['no automatic API calls', 'load catalog', 'choose a live model voice', 'generate audio', 'export local media', 'show error without retry', 'disable module', 'delete local media', 'no horizontal mobile overflow', 'no browser exceptions', 'no external requests'], requests: await evaluate('window.__simulationRequestCount'), exceptions }, null, 2))
  console.log('Venice Studio browser simulation passed; desktop/mobile screenshots saved.')
} finally {
  socket?.close(); chrome.kill('SIGTERM'); vite.kill('SIGTERM'); await writeFile(path.join(output, 'vite.log'), serverLog)
}
