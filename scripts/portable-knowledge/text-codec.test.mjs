import {test} from 'node:test'
import assert from 'node:assert/strict'
import {gzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {decodeKnowledgeText} from './reader.mjs'
const text=('## Città di Forlì\nImporto: 12.450,80 EUR; cliente Èlite.\n').repeat(300)
const legacy={version:1,text,kind:'ocr',sourceHash:'a'.repeat(64),textHash:createHash('sha256').update(text).digest('hex'),fingerprint:'b'.repeat(64)}
const {text:_,...fields}=legacy,packed={...fields,version:2,encoding:'gzip-base64-v1',utf8Bytes:Buffer.byteLength(text),data:gzipSync(text).toString('base64')}
test('independent reader decodes legacy and compressed records with exact citation offsets',()=>{assert.deepEqual(decodeKnowledgeText(legacy),legacy);assert.deepEqual(decodeKnowledgeText(packed),legacy);assert.equal(decodeKnowledgeText(packed).text.slice(3,19),text.slice(3,19))})
test('retains a leading Unicode BOM and exact CRLF/emoji text',()=>{const text='\ufeff'+('Forlì\r\n😀\r\n').repeat(500),value={...packed,utf8Bytes:Buffer.byteLength(text),data:gzipSync(text).toString('base64'),textHash:createHash('sha256').update(text).digest('hex')};assert.equal(decodeKnowledgeText(value).text,text)})
test('rejects corruption, noncanonical base64, decompression overflow and incorrect hashes',()=>{for(const changed of [{data:'AAAA'},{utf8Bytes:10},{utf8Bytes:packed.utf8Bytes+1},{textHash:'c'.repeat(64)},{utf8Bytes:2048001},{data:packed.data+'\n'},{encoding:'unknown'},{extra:true}])assert.throws(()=>decodeKnowledgeText({...packed,...changed}));assert.throws(()=>decodeKnowledgeText({...legacy,text:'altered'}))})
