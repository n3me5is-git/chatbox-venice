import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
export async function runSessionRag({click,evaluate,wait,byText,fill,cdp,output}){
 await click(byText('Test session RAG'))
 await wait(()=>evaluate(`!![...document.querySelectorAll('label')].find(e=>e.textContent==='Enable session RAG')`),'RAG settings did not load')
 await click(`[...document.querySelectorAll('label')].find(e=>e.textContent==='Enable session RAG')`)
 assert.equal(await evaluate(`([...document.querySelectorAll('button')].find(e=>e.textContent==='Save RAG settings')).disabled`),true,'RAG must require provider consent')
 await click(`[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith('I allow the selected'))`)
 await click(byText('Save RAG settings'));await click(byText('Index now'))
 await wait(()=>evaluate(`document.body.textContent.includes('Indexed files')`),'Encrypted RAG index did not finish')
 await fill('Try semantic search','sun');await click(byText('Search indexed files'))
 await wait(()=>evaluate(`!![...document.querySelectorAll('button')].find(e=>e.textContent.includes('docs/energy.md'))`),'Semantic source results did not appear')
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'RAG panel overflows phone width')
 await writeFile(path.join(output,'session-rag-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 await click(`[...document.querySelectorAll('button')].find(e=>e.textContent.includes('docs/energy.md'))`)
 await wait(()=>evaluate(`!![...document.querySelectorAll('h1')].find(e=>e.textContent==='Solar energy')`),'RAG source link did not open rendered Markdown')
 assert.equal(await evaluate(`window.__workspaceCiphertext().includes('Solar panels convert')`),false,'RAG source or vector text leaked into storage')
 await writeFile(path.join(output,'session-rag-source-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 await click(`[...document.querySelectorAll('[role="dialog"]')].at(-1).querySelector('button[aria-label="Close" i]')`)
 await click(`[...document.querySelectorAll('[role="dialog"]')].at(-1).querySelector('button[aria-label="Close" i]')`)
}
