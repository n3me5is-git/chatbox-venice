import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
const outfile='test-results/venice-live/driver.mjs'
await build({entryPoints:['scripts/venice-live-smoke.ts'],outfile,bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:false,banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"}})
await writeFile('test-results/venice-live/source.json',JSON.stringify({commit:process.env.GITHUB_SHA,sha256:createHash('sha256').update(await readFile(outfile)).digest('hex'),credential:'Runtime stdin only. CI does not run live inference.'},null,2))
