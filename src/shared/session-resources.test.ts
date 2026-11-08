import { describe, expect, it } from 'vitest'
import { markdownHeadings, relativeResourcePath, resourceTree, sessionFilePath } from './session-resources'
describe('session resource paths and tree', () => {
  it.each(['../secret','a/../b','/etc/passwd','C:\\secret','a//b','https://example.test/file','a/%2e%2e/x','a.','a/ '])('rejects paths outside the session: %s', path => { expect(() => sessionFilePath(path)).toThrow() })
  it('resolves local Markdown assets without allowing traversal or encoded host paths', () => {
    expect(relativeResourcePath('reports/report.md','../images/chart.png')).toBe('images/chart.png')
    for (const href of ['../../secret','%2e%2e/%2e%2e/secret','https://example.test/x','//example.test/x','file:///etc/a','%5cwindows','#section']) expect(relativeResourcePath('reports/a.md', href)).toBeUndefined()
  })
  it('groups metadata into folders without reading file bodies', () => {
    const tree = resourceTree([{id:'1',origin:'file',path:'reports/a.md',name:'a.md',mime:'text/markdown'},{id:'2',origin:'image',path:'media/a.png',name:'a.png',mime:'image/png'}])
    expect(tree.folders.map(folder => folder.name)).toEqual(['media','reports'])
    expect(tree.folders[1].files[0].id).toBe('1')
  })
  it('ignores headings inside fenced code and gives duplicate headings distinct anchors', () => {
    expect(markdownHeadings('# Intro\n```mermaid\n# ignored\n```\n## Intro')).toEqual([{level:1,title:'Intro',id:'section-0'},{level:2,title:'Intro',id:'section-1'}])
  })
})
