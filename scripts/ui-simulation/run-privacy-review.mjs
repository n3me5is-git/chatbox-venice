import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function runPrivacyReview({ click, evaluate, wait, byText, byLabel, cdp, output }) {
  const control = label => `(document.querySelector('input[aria-label=${JSON.stringify(label)}]') || (${byLabel(label)}))`
  const track = label => `${control(label)}.closest('.mantine-Switch-root').querySelector('.mantine-Switch-track')`
  const choose = async label => {
    await click(byLabel('Secure text chat'))
    await click(`[...document.querySelectorAll('[role="option"]')].findLast(e => e.textContent.trim() === ${JSON.stringify(label)})`)
  }
  await click(byText('Test chat privacy controls'))
  await wait(() => evaluate(`document.body.textContent.includes('Sending is blocked before contacting Venice')`), 'Incompatible model warning missing')
  await click(track('Use provider privacy defaults'))
  await choose('Standard HTTPS')
  await wait(() => evaluate(`document.body.textContent.includes('Use a less protected mode for this chat?')`), 'Chat downgrade had no consent')
  await click(byText('Cancel'))
  assert.equal(await evaluate('window.__simulationChatPrivacy.chats.a.textPrivacy'), 'e2ee')
  await choose('Standard HTTPS')
  await click(byText('Change privacy for this chat'))
  await wait(() => evaluate('window.__simulationChatPrivacy.chats.a.textPrivacy === "standard"'), 'Chat override did not save')
  assert.equal(await evaluate('window.__simulationChatPrivacy.provider.textPrivacy'), 'e2ee')
  await click(byText('Chat B'))
  await wait(() => evaluate(`${control('Use provider privacy defaults')}.checked`), 'Other chat inherited a private override')
  await click(byText('Chat A'))
  await wait(() => evaluate(`(${byLabel('Secure text chat')}).value === 'Standard HTTPS'`), 'Chat privacy was not restored')
  await choose('Require end-to-end encryption')
  await click(track('Compatible gateway receipts'))
  await click(byText('Cancel'))
  assert.equal(await evaluate('window.__simulationChatPrivacy.chats.a.secureReceiptCompatibility'), false)
  await click(track('Compatible gateway receipts'))
  await click(byText('Enable compatible receipts'))
  await click(track('Tools in encrypted chat'))
  await click(byText('Enable tools'))
  await wait(() => evaluate('window.__simulationChatPrivacy.chats.a.e2eeToolsEnabled === true'), 'Chat tool consent did not save')
  await evaluate(`document.querySelector('[data-testid="venice-chat-privacy"]').scrollIntoView({block:'start'})`)
  await writeFile(path.join(output, 'chat-privacy-mobile.png'), Buffer.from((await cdp('Page.captureScreenshot', { captureBeyondViewport: false })).data, 'base64'))
  await click(byText('Close privacy review'))
}
