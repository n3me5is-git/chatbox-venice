// @vitest-environment jsdom
import { expect,it,vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { standaloneMarkdown,mathFontData } from './standalone'
const headings=[{id:'section-1',slug:'title',title:'Title',level:1},{id:'section-5',slug:'details',title:'Details',level:2}]
it('bundles math fonts for offline desktop/mobile exports without file or network fetches',async()=>{
  expect(Object.keys(mathFontData).length).toBeGreaterThan(10)
  const article=document.createElement('article');article.innerHTML='<span class="katex">Formula</span>';const fetcher=vi.fn()
  const fontCSS=readFileSync(createRequire(import.meta.url).resolve('katex/dist/katex.min.css'),'utf8')
  const html=await standaloneMarkdown(article,'Formula',[],new AbortController().signal,{fetcher,fontCSS})
  expect(html).toContain('base64,');expect(html).not.toContain('url(fonts/');expect(fetcher).not.toHaveBeenCalled()
})
it('creates one offline HTML document with embedded images, KaTeX fonts, TOC and working heading links',async()=>{
  const article=document.createElement('article');article.innerHTML='<h1 id="section-1">Title</h1><span class="katex">Formula</span><h2 id="section-5">Details</h2><a href="#details">Jump</a><img src="blob:local-image"><img src="blob:diagram">'
  const fetcher=vi.fn(async(url:any)=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':String(url).includes('font')?'font/woff2':String(url).includes('diagram')?'image/svg+xml':'image/png'}}))
  const css='@font-face{font-family:KaTeX_Main;src:url("./font.woff2") format("woff2"),url("./font.ttf") format("truetype")} .katex{font-family:KaTeX_Main}'
  const html=await standaloneMarkdown(article,'A <title>',headings,new AbortController().signal,{fetcher,fontCSS:css})
  expect(html).toContain('data:image/png;base64,');expect(html).toContain('data:image/svg+xml;base64,');expect(html).toContain('data:font/woff2;base64,');expect(html).not.toContain('font.ttf');expect(html).not.toContain('blob:');expect(html).toContain('href="#section-5"');expect(html).toContain('<nav');expect(html).toContain('default-src');expect(html).toContain('A &lt;title&gt;')
})
it('removes active content and unsafe URL attributes without loading unrelated resources',async()=>{
  const article=document.createElement('article');article.innerHTML='<p onclick="evil()">Text</p><script>evil()</script><iframe src="https://tracker.test"></iframe><a href="javascript:evil()">Unsafe</a><form action="https://tracker.test"><input></form><a href="https://example.test">Safe</a>'
  const fetcher=vi.fn();const html=await standaloneMarkdown(article,'Report',[],new AbortController().signal,{fetcher})
  expect(html).not.toContain('<script');expect(html).not.toContain('onclick');expect(html).not.toContain('<iframe');expect(html).not.toContain('javascript:');expect(html).not.toContain('tracker.test');expect(html).toContain('https://example.test');expect(fetcher).not.toHaveBeenCalled()
})
it('preserves safe document links while refusing links that escape the session path',async()=>{
  const article=document.createElement('article');article.innerHTML='<a href="../data.csv">Data</a><a href="../../../outside.txt">Escape</a>'
  const html=await standaloneMarkdown(article,'Report',[],new AbortController().signal,{documentPath:'docs/report.md'})
  const parsed=new DOMParser().parseFromString(html,'text/html');expect(parsed.querySelector('a')?.getAttribute('href')).toBe('../data.csv');expect(parsed.querySelectorAll('a')[1].hasAttribute('href')).toBe(false)
})
it('waits for diagrams and cancels an export while rendering without contacting any host',async()=>{
  const article=document.createElement('article');article.innerHTML='<span data-export-pending="true">Rendering</span>';const controller=new AbortController(),fetcher=vi.fn()
  const exportTask=standaloneMarkdown(article,'Report',[],controller.signal,{fetcher});controller.abort();await expect(exportTask).rejects.toMatchObject({name:'AbortError'});expect(fetcher).not.toHaveBeenCalled()
})
it('rejects a failed image download instead of claiming the document is self-contained',async()=>{
  const article=document.createElement('article');article.innerHTML='<img src="blob:missing">'
  await expect(standaloneMarkdown(article,'Report',[],new AbortController().signal,{fetcher:vi.fn(async()=>new Response('',{status:404}))})).rejects.toThrow('embed')
})
