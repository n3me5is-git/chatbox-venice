import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { build, loadConfigFromFile } from 'vite'

const output = path.resolve('test-results/knowledge-parser-build')
const dist = path.join(output, 'dist')
await mkdir(output, { recursive: true })
// Read the real production renderer's worker/alias configuration, rather than
// creating an independent config that could hide a packaging regression.
const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, path.resolve('electron.vite.config.ts'))
const renderer = loaded?.config.renderer
assert.ok(renderer, 'Missing real renderer configuration')
await build({
  configFile: false, root: path.resolve('scripts/knowledge-parser-build'),
  publicDir: false, plugins: [], resolve: renderer.resolve, worker: renderer.worker,
  define: renderer.define, build: { target: 'es2020', outDir: dist, emptyOutDir: true, minify: 'esbuild' },
})
const profile = await mkdtemp(path.join(output, 'browser-'))
const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html'
    const file = path.resolve(dist, relative)
    if (!file.startsWith(dist + path.sep)) throw Error('Invalid asset path')
    const bytes = await readFile(file)
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html')
    response.end(bytes)
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const chrome = spawn(process.env.CHROME_PATH || '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=0', '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
let chromeError, chromeLog = '', socket
chrome.on('error', error => { chromeError = error })
chrome.stderr.on('data', bytes => { chromeLog += bytes })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(read) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (chromeError) throw chromeError
    try { const value = await read(); if (value) return value } catch {}
    await delay(100)
  }
  throw Error('Production parser browser timeout: ' + chromeLog.slice(-2000))
}
try {
  const debugPort = await wait(async () => Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]))
  const target = await wait(async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(tab => tab.type === 'page'))
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let serial = 0
  const pending = new Map(), exceptions = []
  socket.onmessage = message => {
    const event = JSON.parse(message.data)
    if (event.id) { const task = pending.get(event.id); if (task) { pending.delete(event.id); event.error ? task.reject(Error(event.error.message)) : task.resolve(event.result) } }
    if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails)
  }
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)) }, 60000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` })
  await wait(() => evaluate('typeof window.runKnowledgeParserBuildSmoke === "function"'))
  const result = await evaluate('window.runKnowledgeParserBuildSmoke()')
  assert.equal(result.results.length, 4)
  assert.equal(result.expansionGuard, true)
  assert.deepEqual(exceptions, [])
  const report = { production: true, mockedWorkers: false, ...result, assets: await readdir(path.join(dist, 'assets')) }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  socket?.close()
  chrome.kill('SIGTERM')
  await new Promise(resolve => server.close(resolve))
  // This helper only removes its own generated profile inside its output root.
  if (!profile.startsWith(output + path.sep)) throw Error('Unexpected browser profile path')
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
