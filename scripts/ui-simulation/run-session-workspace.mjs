import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
export async function runSessionWorkspace({click,evaluate,cdp,wait,byText,byLabel,fill,output}){
  await click(byText('Test session workspace'))
  await wait(()=>evaluate(`!!document.querySelector('[aria-label="Session file tree"]')`),'Session file explorer did not open')
  assert.equal(await evaluate(`window.__workspaceCiphertext().includes('Local reference data')`),false,'Workspace bytes leaked into plaintext storage')
  const file=name=>`[...document.querySelectorAll('[aria-label="Session file tree"] button')].find(e=>e.textContent.startsWith(${JSON.stringify(name)}))`
  await click(file('report.md'))
  await wait(()=>evaluate(`!!document.querySelector('[data-markdown-file] .katex')`),'Markdown math did not render')
  await wait(()=>evaluate(`!!document.querySelector('img[alt="Mermaid diagram"]')`),'Mermaid did not render locally')
  await wait(()=>evaluate(`!!document.querySelector('img[alt="Reference"]')`),'Relative local image did not render')
  await click(`document.querySelector('[data-markdown-file] summary')`)
  await click(byText('Workflow'))
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Workspace overflows phone width')
  await writeFile(path.join(output,'session-markdown-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  await click(`[...document.querySelectorAll('[data-markdown-file] a')].find(e=>e.textContent==='Open data')`)
  await wait(()=>evaluate(`document.body.textContent.includes('Local reference data')`),'Relative Markdown link did not open the session file')
  await click(byText('All session files'));await click(file('report.js'));await click(byText('Run JavaScript'))
  await click(byText('Run code'))
  await wait(()=>evaluate(`document.body.textContent.includes('undefined undefined')&&document.body.textContent.includes('result.md')`),'Actual isolated JavaScript did not return its output')
  assert.equal(await evaluate(`window.__workspaceCiphertext().includes('Verified output')`),false,'Generated file was stored in plaintext')
  // Close the execution modal, then open the persisted output from the tree.
  await click(`[...document.querySelectorAll('[role="dialog"]')].at(-1).querySelector('button[aria-label="Close"]')`)
  await click(byText('All session files'));await click(file('result.md'))
  await wait(()=>evaluate(`!![...document.querySelectorAll('h1')].find(e=>e.textContent==='Generated locally')`),'Execution output did not persist')
  await click(byText('Edit file'));await fill('File content','# Edited locally\n\nSaved from the phone preview.');await click(byText('Save file'))
  await wait(()=>evaluate(`!![...document.querySelectorAll('h1')].find(e=>e.textContent==='Edited locally')`),'File editor did not save')
  await click(byText('Save to deliverables'));await wait(()=>evaluate(`!!document.querySelector('[aria-label="Session file tree"]')`),'Deliverable did not return to explorer')
  assert.equal(await evaluate(`(${file('result.md')}).textContent.includes('Deliverable')`),true,'Deliverable is not marked')
  await click(`[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='Delete resource: result.md')`)
  await click(byText('Delete'))
  await wait(()=>evaluate(`!(${file('result.md')})`),'Individual file deletion did not update the tree')
  assert.equal(await evaluate(`!!(${file('report.md')})&&!!(${file('data.txt')})`),true,'Deleting one output removed other resources')
  await writeFile(path.join(output,'session-explorer-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
  await click(`[...document.querySelectorAll('[role="dialog"]')].at(-1).querySelector('button[aria-label="Close"]')`)
}
