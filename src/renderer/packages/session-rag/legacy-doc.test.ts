import { createRequire } from 'node:module'
import { expect,it } from 'vitest'
import docToText from './vendor/docToText.js'
const {buildDoc,EXPECTED}=createRequire(import.meta.url)('../../../../test/fixtures/rag/make-legacy-doc.cjs')
it('extracts a real binary Word fixture with compressed and UTF-16 text locally',()=>{expect(docToText(buildDoc())).toBe(EXPECTED)})
it('rejects corrupt/unsupported binary documents without sending them to a service',()=>{expect(docToText(new Uint8Array([0,1,2,3]))).toBeNull()})
