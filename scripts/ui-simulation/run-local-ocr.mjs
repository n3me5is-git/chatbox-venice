import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
export async function runLocalOcr({click,evaluate,wait,byText,fill,cdp,output}){
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
 await click(byText('Test local OCR setup'));await wait(()=>evaluate("document.body.textContent.includes('MiniCPM-OCR Q4 · 529 MB')"),'Local OCR modal missing')
 assert.equal(await evaluate("window.__localOcrCalls.every(call=>call.command==='status')"),true,'Opening setup started a download or inference')
 await fill('Keep the model ready after the queue finishes (seconds)','300');await click(byText('Apply processing settings'))
 await wait(()=>evaluate("window.__localOcrCalls.some(call=>call.command==='configure'&&call.value.idleSeconds===300)"),'Idle window did not save')
 await click("document.getElementById([...document.querySelectorAll('label')].find(e=>e.textContent==='Processing hardware').htmlFor)")
 await click("[...document.querySelectorAll('[role=option]')].find(e=>e.textContent==='GPU with Vulkan (requires compatible drivers)')")
 await click(byText('Apply processing settings'));await wait(()=>evaluate("window.__localOcrCalls.some(call=>call.command==='configure'&&call.value.backend==='vulkan')"),'Vulkan did not save')
 await writeFile(path.join(output,'local-ocr-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 await cdp('Emulation.setDeviceMetricsOverride',{width:520,height:900,deviceScaleFactor:1,mobile:false});await evaluate("window.__simulationSetLanguage('it-IT')")
 await wait(()=>evaluate("document.body.textContent.includes('MiniCPM OCR locale')"),'Italian OCR setup missing')
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'OCR setup overflows a narrow desktop window')
 await writeFile(path.join(output,'local-ocr-narrow-it.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 await evaluate("window.__simulationSetLanguage('en')");await click("document.querySelector('button[aria-label=\"Use this OCR model Q4\"]')")
 await wait(()=>evaluate("window.__localOcrSelected==='minicpm-ocr-1.0-q4-k-m-0133ad8'"),'Local model selection failed')
 assert.equal(await evaluate("window.__localOcrCalls.every(call=>['status','configure'].includes(call.command))"),true,'Setup made an unexpected native call')
 await cdp('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true})
}
