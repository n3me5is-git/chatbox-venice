import { workArtifactMimeType } from './work-artifacts'

export type SessionResourceOrigin = 'file' | 'workspace' | 'artifact' | 'attachment' | 'image' | 'media' | 'message'
export interface SessionResource {
  id: string
  path: string
  name: string
  mime: string
  bytes?: number
  origin: SessionResourceOrigin
  messageId?: string
  key?: string
  recordId?: string
  index?: number
  deliverable?: boolean
  updatedAt?: number
  readOnly?: boolean
}
export interface SessionFile extends SessionResource {
  origin: 'file'
  key: string
}
export interface SessionResourceIndex {
  version: 1
  files: SessionFile[]
  removed: string[]
  directories?: string[]
  pythonEnabled?: boolean
  ragEnabled?: boolean
  toolsEnabled?: boolean
}
export const emptyResourceIndex = (): SessionResourceIndex => ({ version: 1, files: [], removed: [] })
export const MAX_RESOURCE_PREVIEW_BYTES = 2 * 1024 * 1024
export const MAX_RESOURCE_FILE_BYTES = 10 * 1024 * 1024

/** The explorer and agent share the same relative path contract. No host paths/URLs. */
export function sessionFilePath(value: string): string {
  if (!value || value.length > 240 || /[\\:%\u0000-\u001f\u007f]/.test(value) || value.startsWith('/')) throw new Error('Use a relative session file path')
  if (value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) throw new Error('Invalid session file path')
  return value
}
export function resourceMime(path: string) {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension === 'py' ? 'text/x-python' : extension === 'yaml' || extension === 'yml' ? 'text/yaml' : workArtifactMimeType(path)
}
export function resourceName(path: string) { return path.split(/[\\/]/).pop() || path }
export function isTextResource(item: Pick<SessionResource, 'mime' | 'name'>) {
  return item.mime.startsWith('text/') || /\.(?:md|markdown|json|csv|tsv|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|swift|c|cpp|cc|h|hpp|rb|php|sh|bash|ps1|bat|sql|r|lua|vue|svelte|graphql|proto|css|html?|xml|ya?ml|txt|log|toml|ini)$/i.test(item.name)
}
/** Resolve Markdown links relative to their document, without escaping this session. */
export function relativeResourcePath(document: string, href: string): string | undefined {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return undefined
  let decoded: string
  try { decoded = decodeURIComponent(href.split(/[?#]/)[0]) } catch { return undefined }
  if (/[\\:%\u0000-\u001f]/.test(decoded) || decoded.startsWith('/')) return undefined
  const parts = document.split('/').slice(0, -1)
  for (const part of decoded.split('/')) {
    if (part === '..') { if (!parts.length) return undefined; parts.pop() }
    else if (part && part !== '.') parts.push(part)
  }
  try { return sessionFilePath(parts.join('/')) } catch { return undefined }
}
export interface ResourceTree { name: string; path: string; folders: ResourceTree[]; files: SessionResource[] }
export function resourceTree(items: SessionResource[], directories: string[] = []): ResourceTree {
  const root: ResourceTree = { name: '', path: '', folders: [], files: [] }
  for (const path of directories) {
    let node = root
    for (const name of sessionFilePath(path).split('/')) { let next = node.folders.find(folder => folder.name === name); if (!next) { next = { name, path: node.path + name + '/', folders: [], files: [] }; node.folders.push(next) }; node = next }
  }
  for (const item of items) {
    const parts = item.path.split('/').filter(Boolean)
    let node = root
    for (const name of parts.slice(0, -1)) {
      let next = node.folders.find(folder => folder.name === name)
      if (!next) { next = { name, path: node.path + name + '/', folders: [], files: [] }; node.folders.push(next) }
      node = next
    }
    node.files.push(item)
  }
  const sort = (node: ResourceTree) => { node.folders.sort((a,b) => a.name.localeCompare(b.name)); node.files.sort((a,b) => a.name.localeCompare(b.name)); node.folders.forEach(sort) }
  sort(root); return root
}
export interface MarkdownHeading { level: number; title: string; id: string }
export function markdownHeadings(source: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  let fence = ''
  for (const line of source.split(/\r?\n/)) {
    const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (mark) { if (!fence) fence = mark[1]; else if (mark[1][0] === fence[0] && mark[1].length >= fence.length) fence = ''; continue }
    if (fence) continue
    const match = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line)
    if (match) headings.push({ level: match[1].length, title: match[2].replace(/[*_`]/g, ''), id: 'section-' + headings.length })
  }
  return headings
}
