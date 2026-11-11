import { readFile } from 'node:fs/promises'
import { getHeapStatistics } from 'node:v8'
import assert from 'node:assert/strict'
import test from 'node:test'

test('pnpm preserves the CI build memory budget in the actual Node process', async () => {
  const npmrc=await readFile(new URL('../.npmrc',import.meta.url),'utf8')
  const workflow=await readFile(new URL('../.github/workflows/build-fork.yml',import.meta.url),'utf8')
  const configured=Number(/^node-options=--max-old-space-size=(\d+)\s*$/m.exec(npmrc)?.[1])
  assert.equal(configured,8192,'Keep the pnpm script heap aligned with the build workflow')
  assert.ok(workflow.includes('NODE_OPTIONS: --max-old-space-size='+configured))
  const effective=getHeapStatistics().heap_size_limit/1024/1024
  console.log('Effective Node heap limit (MiB): '+Math.round(effective))
  assert.ok(effective>=configured,`pnpm reduced the build heap to ${Math.round(effective)} MiB`)
})
