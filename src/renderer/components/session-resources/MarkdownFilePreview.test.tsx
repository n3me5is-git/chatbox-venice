// @vitest-environment jsdom
import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MarkdownFilePreview } from './MarkdownFilePreview'
vi.mock('@/components/Mermaid',()=>({MessageMermaid:({source}:{source:string})=><div data-testid="diagram">{source}</div>}))
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))})
HTMLElement.prototype.scrollIntoView=vi.fn()
afterEach(cleanup)
const props={path:'reports/report.md',resolveImage:vi.fn(async()=>undefined),openFile:vi.fn(),openExternal:vi.fn()}
it('renders math, Mermaid, GFM tables and a TOC with stable heading targets',()=>{
  render(<MantineProvider><MarkdownFilePreview {...props} source={'# Overview\n\n$x^2$\n\nDetails\n-------\n\n```mermaid\ngraph LR\nA-->B\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |'}/></MantineProvider>)
  expect(document.querySelector('.katex')).toBeTruthy();expect(screen.getByTestId('diagram').textContent).toContain('A-->B');expect(screen.getByRole('table')).toBeTruthy()
  fireEvent.click(screen.getByText('Table of contents'));fireEvent.click(screen.getByRole('button',{name:'Details'}));expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  expect(screen.getByRole('heading',{name:'Details'}).id).toMatch(/^section-/)
})
it('opens relative files in this session and external links through the app',()=>{
  render(<MantineProvider><MarkdownFilePreview {...props} source={'[local](../notes.md) [web](https://example.test) [escape](../../outside.md)'}/></MantineProvider>)
  fireEvent.click(screen.getByRole('link',{name:'local'}));expect(props.openFile).toHaveBeenCalledWith('notes.md')
  fireEvent.click(screen.getByRole('link',{name:'web'}));expect(props.openExternal).toHaveBeenCalledWith('https://example.test')
  props.openFile.mockClear();fireEvent.click(screen.getByRole('link',{name:'escape'}));expect(props.openFile).not.toHaveBeenCalled()
})
it('does not contact external image hosts until explicitly enabled, and ignores raw HTML',()=>{
  render(<MantineProvider><MarkdownFilePreview {...props} source={'![Remote](https://example.test/tracker.png)\n\n<script>alert(1)</script>'}/></MantineProvider>)
  expect(screen.queryByRole('img')).toBeNull();expect(document.querySelector('script')).toBeNull()
  fireEvent.click(screen.getByRole('checkbox',{name:'Load external images'}));expect(screen.getByRole('img').getAttribute('src')).toBe('https://example.test/tracker.png')
})
