import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { OfferManager } from '../../src/renderer/packages/collaboration/vendor/trystero026/core/offer-manager.mjs'

test('vendored transport modules match the reviewed integrity manifest', () => {
  const root = new URL('../../src/renderer/packages/collaboration/vendor/trystero026/', import.meta.url)
  const hashes = JSON.parse(readFileSync(new URL('SHA256.json', root)))
  for (const [path, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex'), hash, path)
})

test('idle transport creates no offer pool and each checkout receives a fresh peer', async () => {
  let count = 0
  const manager = new OfferManager(() => ({ id: ++count, destroy() {} }))
  assert.equal(count, 0)
  const first = (await manager.checkout(1, false, async peer => 'offer-' + peer.id))[0]
  const second = (await manager.checkout(1, false, async peer => 'offer-' + peer.id))[0]
  assert.notEqual(first.peer, second.peer); assert.equal(second.offer, 'offer-2')
  manager.destroy()
  await assert.rejects(() => manager.checkout(1, false, async () => 'bad'), /room left/)
})
