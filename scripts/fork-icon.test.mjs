import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
test('the fork icon has valid PNG images for small and large Windows sizes', () => {
  const ico = readFileSync('assets/fork-icon.ico')
  assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1)
  const count = ico.readUInt16LE(4), sizes = []
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16, size = ico.readUInt32LE(offset + 8), start = ico.readUInt32LE(offset + 12)
    sizes.push(ico[offset] || 256)
    assert.ok(start + size <= ico.length)
    assert.equal(ico.subarray(start, start + 8).toString('hex'), '89504e470d0a1a0a')
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256])
  assert.notDeepEqual(ico, readFileSync('assets/icon.ico'))
})
