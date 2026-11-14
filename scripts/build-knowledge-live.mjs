import {build} from 'esbuild'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
const outfile='test-results/knowledge-live/driver.mjs'
await build({entryPoints:['scripts/knowledge-live/driver.ts'],outfile,bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:false,banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"}})
await writeFile('test-results/knowledge-live/source.json',JSON.stringify({commit:process.env.GITHUB_SHA,sha256:createHash('sha256').update(await readFile(outfile)).digest('hex'),credentials:'Runtime stdin only; CI does not perform live inference'},null,2))

await build({entryPoints:['scripts/knowledge-live/verification.ts'],outfile:'test-results/knowledge-live/verification.mjs',bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:false,banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"}})
