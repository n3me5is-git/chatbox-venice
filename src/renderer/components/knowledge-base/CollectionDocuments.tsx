import {IndexingBackgroundSettings} from './IndexingBackgroundSettings'
import {isOfficePreview} from '@/components/common/OfficeDocumentViewer'
import {indexStageLabel} from './IndexingStatus'
import {ragFingerprint} from '@shared/session-rag-engine'
import { ActionIcon, Alert, Badge, Button, Card, Group, Stack, Text, TextInput } from '@mantine/core'
import { FeatureMenu as Menu } from '@/components/common/FeatureMenu'
import { IconChevronLeft, IconChevronRight, IconDots, IconFileText, IconPlus, IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { forkT as ft } from '@/i18n/fork'
import type { CollectionData, KnowledgeCollections } from '@/packages/knowledge-collections/store'
import type { RagIndex } from '@shared/session-rag'

export function CollectionDocuments({ id, data, index, busy, readOnly, dirty, store, run, reload, addFiles, onPreview, onReadSource, onSettings, onProgress }: {
  id: number; data: CollectionData; index: RagIndex | null; busy: boolean; readOnly: boolean; dirty: boolean
  store: KnowledgeCollections; run: (work: () => Promise<void>) => Promise<void>; reload: () => Promise<void>
  addFiles: (files: FileList | null) => void
  onPreview: (text: string, kind: 'parsed' | 'passages') => void; onSettings: () => void
  onReadSource: (fileId: number) => void
  onProgress: (path: string) => void
}) {
  const [filter, setFilter] = useState(''), [requestedPage, setPage] = useState(0)
  const matching = useMemo(() => data.files.filter(file => (file.linkedPath || file.name).toLocaleLowerCase().includes(filter.toLocaleLowerCase())), [data.files, filter])
  const pages = Math.max(1, Math.ceil(matching.length / 50)), page = Math.min(requestedPage, pages - 1)
  const indexedFiles=useMemo(()=>new Map(index?.files.map(file=>[file.path,file])||[]),[index]),failedFiles=useMemo(()=>new Set(index?.errors.map(file=>file.path)||[]),[index]),indexCurrent=index?.fingerprint===ragFingerprint(data.settings)
  const indexDisabled = busy || readOnly || dirty
  return <Stack gap="md" data-testid="collection-documents">
    <Group gap="xs"><Badge variant="light">{data.files.length} {ft('Documents')}</Badge><Badge variant="light">{index?.files.reduce((sum, file) => sum + file.chunks, 0) || 0} {ft('Passages')}</Badge></Group>
    <div className="feature-actions">
      <Button component="label" leftSection={<IconPlus size={18}/>} disabled={busy || readOnly}>
        {ft('Add documents')}<input type="file" hidden multiple disabled={busy || readOnly} onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = '' }}/>
      </Button>
      <Button variant="light" leftSection={<IconSearch size={18}/>} disabled={indexDisabled} onClick={() => void run(async () => { await store.index(id, onProgress); await reload() })}>{ft('Index now')}</Button>

    </div>
    <IndexingBackgroundSettings vault={store.vault}/>
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
        <Group gap="xs"><Badge variant="light" color={failedFiles.has(file.path)?"red":"gray"}>{ft(store.progress?.get(id)?.files[file.path]&&store.running(id)?indexStageLabel[store.progress.get(id)!.files[file.path].stage]:failedFiles.has(file.path)?'Indexing failed':indexedFiles.has(file.path)&&(!file.hash||indexedFiles.get(file.path)?.hash===file.hash)&&indexCurrent?'Indexed':indexedFiles.has(file.path)?'Needs update':'Not indexed')}</Badge></Group>
        <Group wrap="nowrap" gap="xs">
          <Button variant="default" style={{ flex: 1 }} disabled={busy} onClick={() => {if(file.mime==='application/pdf'||isOfficePreview(file.name))onReadSource(file.id);else void run(async () => { const document = await store.documentText(id, file.id); onPreview(document.text, 'parsed') })}}>{ft('Read document')}</Button>
          <Menu withinPortal={false} position="bottom-end" width={260}>
            <Menu.Target><ActionIcon variant="subtle" size={44} aria-label={ft('Document actions for {{name}}', { name: file.name })}><IconDots size={20}/></ActionIcon></Menu.Target>
            <Menu.Dropdown>
              <Menu.Item disabled={busy} onClick={()=>void run(async()=>{const document=await store.documentText(id,file.id);onPreview(document.text,'parsed')})}>{ft('View extracted text')}</Menu.Item>
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
    {pages > 1 && <Group justify="space-between" gap="xs" wrap="nowrap"><ActionIcon size={44} variant="default" aria-label={ft('Previous page')} disabled={page === 0} onClick={() => setPage(page - 1)}><IconChevronLeft size={20}/></ActionIcon><Text size="sm">{page + 1} / {pages}</Text><ActionIcon size={44} variant="default" aria-label={ft('Next page')} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><IconChevronRight size={20}/></ActionIcon></Group>}
  </Stack>
}
