import { ActionIcon, Alert, Badge, Button, Card, Group, Menu, Stack, Text, TextInput } from '@mantine/core'
import { IconDots, IconFileText, IconPlus, IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { forkT as ft } from '@/i18n/fork'
import type { CollectionData, KnowledgeCollections } from '@/packages/knowledge-collections/store'
import type { RagIndex } from '@shared/session-rag'

export function CollectionDocuments({ id, data, index, busy, readOnly, dirty, store, run, reload, addFiles, onPreview, onSettings, onProgress }: {
  id: number; data: CollectionData; index: RagIndex | null; busy: boolean; readOnly: boolean; dirty: boolean
  store: KnowledgeCollections; run: (work: () => Promise<void>) => Promise<void>; reload: () => Promise<void>
  addFiles: (files: FileList | null) => void
  onPreview: (text: string, kind: 'parsed' | 'passages') => void; onSettings: () => void
  onProgress: (path: string) => void
}) {
  const [filter, setFilter] = useState(''), [requestedPage, setPage] = useState(0)
  const matching = useMemo(() => data.files.filter(file => (file.linkedPath || file.name).toLocaleLowerCase().includes(filter.toLocaleLowerCase())), [data.files, filter])
  const pages = Math.max(1, Math.ceil(matching.length / 50)), page = Math.min(requestedPage, pages - 1)
  const indexDisabled = busy || readOnly || dirty
  return <Stack gap="md" data-testid="collection-documents">
    <Group gap="xs"><Badge variant="light">{data.files.length} {ft('Documents')}</Badge><Badge variant="light">{index?.files.reduce((sum, file) => sum + file.chunks, 0) || 0} {ft('Passages')}</Badge></Group>
    <div className="feature-actions">
      <Button component="label" leftSection={<IconPlus size={18}/>} disabled={busy || readOnly}>
        {ft('Add documents')}<input type="file" hidden multiple disabled={busy || readOnly} onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = '' }}/>
      </Button>
      <Button variant="light" leftSection={<IconSearch size={18}/>} disabled={indexDisabled} onClick={() => void run(async () => { await store.index(id, onProgress); await reload() })}>{ft('Index now')}</Button>
      <Menu withinPortal={false} position="bottom-end" width={260}>
        <Menu.Target><ActionIcon variant="default" size={44} aria-label={ft('Index actions')}><IconDots size={20}/></ActionIcon></Menu.Target>
        <Menu.Dropdown>
          <Menu.Item disabled={indexDisabled} onClick={() => {
            if (window.confirm(ft('Rebuild all vectors with the saved settings? This sends documents to the selected providers again.'))) void run(async () => { await store.index(id, onProgress, true); await reload() })
          }}>{ft('Reindex collection')}</Menu.Item>
          <Menu.Item color="red" disabled={busy || readOnly} onClick={() => {
            if (window.confirm(ft('Delete the local RAG index? Source files are kept.'))) void run(async () => { await store.clearIndex(id); await reload() })
          }}>{ft('Clear index')}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
    {dirty && <Alert color="yellow"><Stack gap="xs"><Text size="sm">{ft('Save your settings before updating the index.')}</Text><Button variant="subtle" onClick={onSettings}>{ft('Review settings')}</Button></Stack></Alert>}
    {readOnly && <Text size="sm" c="dimmed">{ft('Read-only mount')}</Text>}
    <Text size="xs" c="dimmed">{ft('Add files up to 50 MB, then update the index to make them searchable.')}</Text>
    {index?.stats && <Text size="xs" c="dimmed">{ft('Last index update')}: {index.stats.embeddedChunks} {ft('new embeddings')} · {index.stats.reusedChunks} {ft('reused passages')} · {index.stats.unchangedFiles} {ft('unchanged documents')}</Text>}
    {index?.errors.map(item => <Alert color="red" key={item.path}>{item.path}: {ft(item.error)}</Alert>)}
    {index?.files.filter(item => item.warning).map(item => <Alert color="yellow" key={item.path}>{item.path}: {ft(item.warning!)}</Alert>)}
    <TextInput label={ft('Filter collection documents')} leftSection={<IconSearch size={18}/>} value={filter} onChange={event => { setFilter(event.currentTarget.value); setPage(0) }}/>
    {!matching.length && <Card withBorder><Stack gap="sm" align="center" py="md"><IconFileText size={32}/><Text c="dimmed">{ft(data.files.length ? 'No documents match your filter.' : 'Your collection is ready for its first document.')}</Text></Stack></Card>}
    {matching.slice(page * 50, page * 50 + 50).map(file => <Card key={file.id} withBorder padding="sm" radius="md" style={{ overflow: 'visible' }}>
      <Stack gap="sm">
        <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>{file.linkedPath || file.name}</Text>
        <Group wrap="nowrap" gap="xs">
          <Button variant="default" style={{ flex: 1 }} disabled={busy} onClick={() => void run(async () => { const document = await store.documentText(id, file.id); onPreview(document.text, 'parsed') })}>{ft('Open parsed document')}</Button>
          <Menu withinPortal={false} position="bottom-end" width={260}>
            <Menu.Target><ActionIcon variant="subtle" size={44} aria-label={ft('Document actions for {{name}}', { name: file.name })}><IconDots size={20}/></ActionIcon></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item disabled={busy} onClick={() => void run(async () => {
                const chunks = await store.chunks(id, Array.from({ length: 20 }, (_, n) => ({ fileId: file.id, chunkIndex: n })))
                onPreview(chunks.map(item => '[' + item.chunkIndex + '] ' + item.text).join('\n\n') || ft('Build the index first'), 'passages')
              })}>{ft('Preview passages')}</Menu.Item>
              <Menu.Item component="label" disabled={busy || readOnly}>{ft('Replace source')}<input hidden type="file" disabled={busy || readOnly} onChange={event => { const source = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (source) void run(async () => { await store.replaceFile(id, file.id, source); await reload() }) }}/></Menu.Item>
              <Menu.Item color="red" disabled={busy || readOnly} onClick={() => {
                if (window.confirm(ft('Delete this document and its local index?'))) void run(async () => { await store.removeFile(id, file.id); await reload() })
              }}>{ft('Delete')}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Stack>
    </Card>)}
    {pages > 1 && <Group justify="space-between" gap="xs"><Button variant="default" disabled={page === 0} onClick={() => setPage(page - 1)}>{ft('Previous page')}</Button><Text size="sm">{page + 1} / {pages}</Text><Button variant="default" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{ft('Next page')}</Button></Group>}
  </Stack>
}
