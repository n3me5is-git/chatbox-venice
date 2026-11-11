import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { assertReleaseNotes } from './release-notes-policy.mjs'

test('all release notes are concise and user-facing', () => {
  for (const file of readdirSync('docs/releases').filter(name => /^v\d+\.\d+\.\d+\.md$/.test(name))) assertReleaseNotes(readFileSync(`docs/releases/${file}`, 'utf8'), file)
})
test('reports cannot accidentally become published notes', () => {
  for (const body of ['# Validation\n120 tests passed', '# Changes\n\nhttps://github.com/owner/repo/actions/runs/123', '# Fixed\nSee request.test.ts', 'word '.repeat(201)]) assert.throws(() => assertReleaseNotes(body))
  assert.doesNotThrow(() => assertReleaseNotes('# Fixes\n\n- Fix HTTP 400 when creating music.\n- Add transparent backgrounds.'))
})
