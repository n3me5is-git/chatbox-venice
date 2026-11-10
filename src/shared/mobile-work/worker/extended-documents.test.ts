import {expect,it} from 'vitest'
import {zipSync,strToU8} from 'fflate'
import {extendedDocument,rtfText} from './extended-documents'
import {parseLocalDocument} from './document-parser'
const archive=(files:Record<string,string>)=>zipSync(Object.fromEntries(Object.entries(files).map(([path,text])=>[path,strToU8(text)])))
it('reads EPUB spine order, relative chapters and entities without network resources',async()=>{
 const bytes=archive({'META-INF/container.xml':'<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>','OEBPS/book.opf':'<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>','OEBPS/a.xhtml':'<html><body><p>Second &amp; last</p></body></html>','OEBPS/b.xhtml':'<html><body><p>First chapter</p><script>secret()</script><img src="https://example.com/tracker"/></body></html>'})
 const result=await parseLocalDocument('book.epub',bytes);expect(result.text).toContain('First chapter');expect(result.text.indexOf('First')).toBeLessThan(result.text.indexOf('Second'));expect(result.text).not.toContain('secret');expect(result.text).toContain('Second & last')
})
it('extracts OpenDocument paragraphs and RTF unicode while excluding embedded objects',()=>{
 expect(extendedDocument('notes.odt',archive({'content.xml':'<office:document xmlns:office="o" xmlns:text="t"><text:h>Title</text:h><text:p>Private &amp; local</text:p></office:document>'}))).toBe('Title\nPrivate & local')
 expect(rtfText('{\\rtf1\\ansi{\\fonttbl font}Hello \\u224? world\\par {\\pict hidden}End}')).toBe('Hello à world\nEnd')
})
it('rejects external entities, escaping EPUB chapter paths and malformed archives',()=>{
 expect(()=>extendedDocument('bad.odt',archive({'content.xml':'<!DOCTYPE foo [<!ENTITY a SYSTEM "file:///secret">]><text:p>&a;</text:p>'}))).toThrow('XML')
 const bytes=archive({'META-INF/container.xml':'<container><rootfile full-path="book.opf"/></container>','book.opf':'<package><manifest><item id="a" href="../../secret"/></manifest><spine><itemref idref="a"/></spine></package>'})
 expect(()=>extendedDocument('bad.epub',bytes)).toThrow('path');expect(()=>extendedDocument('bad.epub',new Uint8Array([1,2]))).toThrow('archive')
})
