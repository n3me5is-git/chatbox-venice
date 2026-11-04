import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const yaml = readFileSync(new URL('../.github/workflows/publish-release.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const block = yaml.match(/          script: \|\n([\s\S]*?)(?=      - uses:)/)?.[1]
assert.ok(block, 'Release preflight script must exist')
const execute = new (Object.getPrototypeOf(async function () {}).constructor)('github', 'context', 'core', 'process', block.split('\n').map(line => line.slice(12)).join('\n'))
const sha = 'a'.repeat(40)
const job = (name, run_attempt, conclusion = 'success') => ({ id: run_attempt * 100, name, run_attempt, conclusion })
const packages = [job('Package Windows x64 setup', 2), job('Package Android APK', 2)]

async function preflight(jobs, { published = false, branch = 'main' } = {}) {
  const outputs = {}
  const github = {
    rest: {
      actions: {
        getWorkflowRun: async () => ({ data: { path: '.github/workflows/build-fork.yml', head_branch: branch, head_sha: sha, head_repository: { full_name: 'owner/fork' } } }),
        listJobsForWorkflowRun: () => {},
      },
      repos: {
        getContent: async () => ({ data: { content: Buffer.from(JSON.stringify({ version: '1.24.2' })).toString('base64') } }),
        getReleaseByTag: async () => { if (published) return { data: { draft: false } }; throw Object.assign(new Error('not found'), { status: 404 }) },
      },
    },
    paginate: async (_, params) => { assert.equal(params.filter, 'all'); return jobs },
  }
  await execute(github, { repo: { owner: 'owner', repo: 'fork' } }, { setOutput: (key, value) => { outputs[key] = value }, notice: () => {} }, { env: { BUILD_RUN_ID: '123' } })
  return outputs
}

test('reuses successful checks before GitHub copies them into a retry attempt', async () => {
  assert.deepEqual(await preflight([...packages, job('Checks / Validate and test', 1)]), { sha, publish: 'true' })
})
test('rejects a newer failure even if an older attempt passed', async () => {
  await assert.rejects(preflight([...packages, job('Checks / Validate and test', 1), job('Checks / Validate and test', 2, 'failure')]), /Required checks/)
})
test('accepts the latest success after a failed check and skips existing public releases', async () => {
  const outputs = await preflight([...packages, job('Checks / Validate and test', 1, 'failure'), job('Checks / Validate and test', 2)], { published: true })
  assert.equal(outputs.publish, 'false')
})
test('rejects artifacts from another branch before publishing', async () => {
  await assert.rejects(preflight([...packages, job('Checks / Validate and test', 1)], { branch: 'unreviewed' }), /fork main branch/)
})
