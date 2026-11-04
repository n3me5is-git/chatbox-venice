import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const version = JSON.parse(readFileSync('release/app/package.json', 'utf8')).version
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a stable semantic version for the fork release')
const tag = `v${version}`
const sourceSha = process.env.RELEASE_SOURCE_SHA || process.env.GITHUB_SHA
if (!/^[a-f0-9]{40}$/.test(sourceSha || '')) throw new Error('A verified source commit is required')
const notes = `docs/releases/${tag}.md`
readFileSync(notes)
const dir = 'release/artifacts'
for (const name of readdirSync(dir)) {
  if (name.endsWith('.apk')) renameSync(join(dir, name), join(dir, `Chatbox-Venice-${version}-Android.apk`))
}
const files = readdirSync(dir).filter((name) => /\.(exe|apk|blockmap|yml)$/.test(name)).sort()
if (!files.some((name) => name.endsWith('.exe')) || !files.some((name) => name.endsWith('.apk')) || !files.includes('latest.yml')) {
  throw new Error('Release requires the setup, APK and updater metadata')
}
writeFileSync(join(dir, 'SHA256SUMS.txt'), files.map((name) => `${createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')}  ${name}`).join('\n') + '\n')
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let existing
try { existing = JSON.parse(gh('release', 'view', tag, '--json', 'isDraft,targetCommitish')) } catch (error) {
  if (!String(error.stderr || '').includes('release not found')) throw error
}
if (existing && !existing.isDraft) {
  console.log(`Published release ${tag} already exists; leaving it unchanged.`)
} else {
  if (existing && existing.targetCommitish !== sourceSha) throw new Error('Existing draft belongs to another commit')
  if (!existing) gh('release', 'create', tag, '--draft', '--target', sourceSha, '--title', `Chatbox Venice ${version}`, '--notes-file', notes)
  gh('release', 'upload', tag, ...files.map((name) => join(dir, name)), join(dir, 'SHA256SUMS.txt'), '--clobber')
  gh('release', 'edit', tag, '--draft=false', '--latest')
  console.log(`Published ${tag} from ${sourceSha}`)
}
