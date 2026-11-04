// @vitest-environment jsdom

import ReactDOMServer from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    exporter: { exportByUrl: vi.fn(), exportImageFile: vi.fn() },
  },
}))

vi.mock('./Artifact', () => ({
  isRenderableCodeLanguage: () => false,
}))

import Markdown from './Markdown'

describe('Markdown server rendering', () => {
  it('attaches source-stable identities to actual rendered Markdown blocks', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <Markdown uniqueId="message-0">{'First paragraph\n\nSecond paragraph'}</Markdown>
    )
    expect(html).toContain('data-transcript-block="message-0:0"')
    expect(html).toContain('data-transcript-block="message-0:17"')
  })

  it('keeps image rendering available to HTML exports without client providers', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <Markdown>{'![Exported image](https://example.com/exported.png)'}</Markdown>
    )

    expect(html).toContain('src="https://example.com/exported.png"')
    expect(html).toContain('alt="Exported image"')
  })
  it('renders Venice references received after the answer as clickable links in saved and exported chats', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <Markdown>{'Answer [1][venice-source-1]\n\n**Sources**\n1. [Source](<https://example.com/source>)\n\n[venice-source-1]: <https://example.com/source>\n'}</Markdown>
    )
    expect((html.match(/href="https:\/\/example.com\/source"/g) || [])).toHaveLength(2)
    expect(html).not.toContain('venice-source-1')
  })

})
