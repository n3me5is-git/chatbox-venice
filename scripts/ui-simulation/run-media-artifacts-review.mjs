import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
export async function runMediaArtifactsReview({click,evaluate,wait,byText,cdp,output}){
 await click(byText('Test media artifact players'))
 const card=id=>`document.querySelector('[data-media-artifact="${id}"] button')`
 await wait(()=>evaluate(`!!(${card('audio')})`),'Saved media artifact was not attached to the chat')
 assert.equal(await evaluate('window.__mediaPreviewReads'),0,'A closed artifact loaded media bytes')
 await click(card('audio'));await wait(()=>evaluate(`!!document.querySelector('[role="dialog"] audio[aria-label="Generated audio"]')`),'Audio artifact did not open a modal player')
 assert.equal(await evaluate(`document.querySelector('[role="dialog"] audio').paused`),true,'Audio played automatically')
 const oldURL=await evaluate(`document.querySelector('[role="dialog"] audio').src`)
 await evaluate(`(()=>{const audio=document.querySelector('[role="dialog"] audio');audio.muted=true;return audio.play()})()`)
 await wait(()=>evaluate(`document.querySelector('[role="dialog"] audio').currentTime>0.05`),'The local WAV did not play')
 await writeFile(path.join(output,'chat-audio-artifact-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 await evaluate('window.__simulationBack()');await wait(()=>evaluate(`!document.querySelector('[role="dialog"] audio')`),'Back did not close audio playback')
 assert.equal(await evaluate(`fetch(${JSON.stringify(oldURL)}).then(()=>true,()=>false)`),false,'Closed playback retained its blob URL')
 await click(card('video'));await wait(()=>evaluate(`!!document.querySelector('[role="dialog"] video[aria-label="Generated video"]')`),'Video artifact did not open a modal player')
 assert.equal(await evaluate(`document.querySelector('[role="dialog"] video').paused`),true,'Video played automatically')
 await evaluate(`(()=>{const video=document.querySelector('[role="dialog"] video');video.muted=true;return video.play()})()`)
 await wait(()=>evaluate(`document.querySelector('[role="dialog"] video').videoWidth===32&&document.querySelector('[role="dialog"] video').currentTime>0.05`),'The local video did not decode and play')
 await writeFile(path.join(output,'chat-video-artifact-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{captureBeyondViewport:false})).data,'base64'))
 await evaluate('window.__simulationBack()');await wait(()=>evaluate(`!document.querySelector('[role="dialog"] video')`),'Back did not close video playback')
 assert.equal(await evaluate(`(${card('queued')}).disabled`),true)
 await evaluate('window.__completeQueuedMedia()');await wait(()=>evaluate(`!(${card('queued')}).disabled`),'Queued media did not become playable without a chat reload')
 await click(byText('Recall saved music'));await wait(()=>evaluate(`!!(${card('audio')})&&!(${card('video')})`),'The show tool did not recall the saved artifact')
 assert.equal(await evaluate('window.__mediaProviderCalls'),0,'Playing/recalling media made a provider request')
 await click(byText('Close media artifact test'))
 await wait(()=>evaluate(`!document.body.textContent.includes('Chat media artifact regression')`),'Artifact test did not close')
 await writeFile(path.join(output,'media-artifacts-report.json'),JSON.stringify({audioDecodedAndPlayed:true,videoDecodedAndPlayed:true,noAutoplay:true,lazyBytes:true,objectURLReleased:true,queueUpdatesWithoutReload:true,showToolRecallsExistingFile:true,providerRequests:0},null,2))
}
