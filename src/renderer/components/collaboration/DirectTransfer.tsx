import { Alert, Badge, Button, Card, Checkbox, Collapse, FileButton, Group, Image, PasswordInput, Progress, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { IconCopy, IconQrcode } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { rendererApplication } from '@/app/renderer-application'
import { sessionTransfers, initializeSessionTransfers } from '@/packages/session-transfer/runtime'
import { analyzeTransfer, importTransfer, type TransferAnalysis } from '@/packages/session-transfer/import'
import { prepareTransfer, transferReceiptKey, type TransferReceipt } from '@/packages/session-transfer/snapshot'
import { readAgentData } from '@/packages/multi-agent/storage'
import { vaultRuntimeFor } from '@/packages/vault/runtime'
import { requestProtectedAccess } from '@/components/security/requestUnlock'
import { qrSvg } from '@/packages/collaboration/transport'
import { pairingFromImage } from '@/packages/collaboration/qr'
import { collaborationError } from '@/packages/collaboration/errors'
import { copyToClipboard } from '@/packages/navigator'
import { switchCurrentSession } from '@/stores/session/crud'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { PairingScanner } from './PairingScanner'
const size = (bytes: number) => (bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' MB'

export function DirectTransferContent({ sessionId }: { sessionId?: string }) {
  useTranslation(); useSyncExternalStore(sessionTransfers.subscribe, sessionTransfers.getVersion)
  const { folders } = rendererApplication.sessionHooks.useSessionFolders()
  const [selected, setSelected] = useState(() => [...sessionTransfers.hosts.values()].find(room => room.sessionId === sessionId)?.id || ''), [code, setCode] = useState(''), [name, setName] = useState(''), [includeProtected, setIncludeProtected] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [scanning, setScanning] = useState(false), [prepared, setPrepared] = useState({ objects: 0, bytes: 0 })
  const [mode, setMode] = useState('new'), [chatName, setChatName] = useState(''), [folderId, setFolderId] = useState(''), [confirm, setConfirm] = useState(false), [matches, setMatches] = useState<Array<{ value: string; label: string; folderId?: string }>>([])
  const [analysis, setAnalysis] = useState<TransferAnalysis>(), [comparing, setComparing] = useState(false), [revision, setRevision] = useState(0), [progress, setProgress] = useState({ completed: 0, total: 0, downloaded: 0, reused: 0 })
  const [networkOpen, setNetworkOpen] = useState(false), [relay, setRelay] = useState(''), [turnUrl, setTurnUrl] = useState(''), [turnUsername, setTurnUsername] = useState(''), [turnCredential, setTurnCredential] = useState(''), [relayOnly, setRelayOnly] = useState(false)
  const controller = useRef<AbortController>(), analysisRef = useRef<TransferAnalysis>()
  const host = sessionTransfers.hosts.get(selected), guest = sessionTransfers.guests.get(selected), manifest = guest?.manifest
  const network = { turnUrl: turnUrl.trim(), turnUsername: turnUsername.trim(), turnCredential, relayOnly }
  const closeScanner = useCallback(() => setScanning(false), [])
  const scanned = useCallback((value: string) => { setCode(value); setScanning(false); setError('') }, [])
  useEffect(() => { initializeSessionTransfers(); void platform.getStoreValue('collaboration-display-name').then(value => { if (typeof value === 'string') setName(value.slice(0, 60)) }); return () => controller.current?.abort() }, [])
  useEffect(() => {
    setMode('new'); setConfirm(false); setMatches([]); setChatName(manifest?.sessions.find(item => item.id === manifest.rootId)?.name || '')
    if (!manifest) return
    let active = true
    void (async () => {
      const storage = platform.getSessionMetaStorage(); await storage.initialize()
      const found: typeof matches = []
      for (const item of await storage.getAllIncludingHidden()) {
        if (!active) return
        if (item.hidden || item.archivedAt) continue
        try { const receipt = await readAgentData<TransferReceipt | null>(transferReceiptKey(item.id), null); if (item.id === manifest.rootId || receipt?.lineage === manifest.lineage) found.push({ value: item.id, label: item.name, folderId: item.folderId }) } catch { /* Locked chats cannot be compared until unlocked. */ }
      }
      if (active) setMatches(found)
    })().catch(reason => active && setError(collaborationError(reason)))
    return () => { active = false }
  }, [manifest?.id])
  useEffect(() => {
    setAnalysis(undefined); analysisRef.current = undefined; setConfirm(false)
    if (!manifest || guest?.status === 'complete') return
    let active = true, prepared: TransferAnalysis | undefined
    const abort = new AbortController(); setComparing(true); setError('')
    void analyzeTransfer(manifest, mode === 'new' ? undefined : mode, abort.signal).then(value => { prepared = value; if (active) { setAnalysis(value); analysisRef.current = value } else void value.local?.dispose() }).catch(reason => { if (active) setError(collaborationError(reason)) }).finally(() => active && setComparing(false))
    return () => { active = false; abort.abort(); void prepared?.local?.dispose() }
  }, [manifest?.id, mode, revision])
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setBusy(true); setError('')
    try { await work(abort.signal) } catch (reason) { if (!abort.signal.aborted) setError(collaborationError(reason)) }
    finally { if (controller.current === abort) setBusy(false) }
  }
  const prepare = () => run(async signal => {
    if (!sessionId) return
    const vault = vaultRuntimeFor(platform), scope = await vault.projects.sessionScope(sessionId)
    if (scope && !vault.keys.isUnlocked(scope) && !await requestProtectedAccess(scope)) return
    if (includeProtected && (await vault.keys.status('app')).configured && !vault.keys.isUnlocked('app') && !await requestProtectedAccess('app')) return
    setPrepared({ objects: 0, bytes: 0 })
    const source = await prepareTransfer(sessionId, includeProtected, signal, (objects, bytes) => setPrepared({ objects, bytes }))
    try { signal.throwIfAborted(); const room = await sessionTransfers.host(sessionId, source, relay || undefined, network); setSelected(room.id) }
    catch (reason) { await source.dispose(); throw reason }
  })
  const receive = () => run(async signal => {
    if (!guest || !analysisRef.current) return
    const current = analysisRef.current, target = folderId || undefined, vault = vaultRuntimeFor(platform), scope = await vault.projects.folderScope(target)
    if (scope && !vault.keys.isUnlocked(scope) && !await requestProtectedAccess(scope)) return
    let result: Awaited<ReturnType<typeof importTransfer>>
    try { result = await importTransfer(current, id => sessionTransfers.read(guest.id, id, signal), { name: chatName, folderId: target, confirmLocalChanges: confirm, signal, verifySource: () => sessionTransfers.verify(guest.id, signal), progress: (completed, total, downloaded, reused) => setProgress({ completed, total, downloaded, reused }) }) }
    catch (reason) { setRevision(value => value + 1); throw reason }
    guest.result = result
    try { await sessionTransfers.verify(guest.id, signal, true) }
    catch { result.warning = ft('The local copy is ready. The sender could not confirm completion; no data was lost.') }
    guest.status = 'complete'; sessionTransfers.changed()
    setAnalysis(undefined); analysisRef.current = undefined
  })
  const rooms = [...[...sessionTransfers.hosts.values()].map(room => ({ value: room.id, label: ft('Send') + ' · ' + room.source.manifest.sessions[0].name })), ...[...sessionTransfers.guests.values()].map(room => ({ value: room.id, label: ft('Receive') + ' · ' + (room.manifest?.sessions[0].name || ft('Connecting…')) }))]
  const protectedTransfer = manifest?.sessions.some(item => item.protected) || manifest?.objects.some(item => item.protected)
  return <Stack gap="md">
    <Text size="sm" c="dimmed">{ft('Move work between devices or send someone a complete copy. Chats, child agents and files travel over an encrypted peer connection. Provider credentials, device keys and automatic execution permissions stay on this device.')}</Text>
    {sessionId && !host && <Card withBorder><Stack gap="sm"><Text fw={600}>{ft('Send this chat to another device')}</Text><Checkbox checked={includeProtected} label={ft('Include unlocked protected content')} onChange={event => setIncludeProtected(event.currentTarget.checked)} /><Text size="xs">{ft('Protected content requires a protected project on the receiving device. Stop active generations and agents before preparing a copy.')}</Text><Button loading={busy} onClick={() => void prepare()}>{ft('Prepare transfer and pairing code')}</Button>{busy && <Text size="xs">{ft('Preparing {{count}} items · {{size}}', { count: prepared.objects, size: size(prepared.bytes) })}</Text>}</Stack></Card>}
    <Card withBorder><Stack gap="sm"><Text fw={600}>{ft('Receive a chat')}</Text><TextInput label={ft('Your display name')} value={name} maxLength={60} onChange={event => setName(event.currentTarget.value)} /><Textarea label={ft('Direct transfer code')} value={code} onChange={event => setCode(event.currentTarget.value.slice(0, 700))} minRows={2} maxRows={4} autosize /><Group><Button variant="default" leftSection={<IconQrcode size={16} />} onClick={() => setScanning(true)}>{ft('Scan with camera')}</Button><FileButton accept="image/*" onChange={file => { if (file) void run(async () => scanned(await pairingFromImage(file))) }}>{props => <Button {...props} variant="default">{ft('Upload QR image')}</Button>}</FileButton><Button loading={busy} disabled={!name.trim() || !code.trim()} onClick={() => void run(async () => { const room = await sessionTransfers.join(code, name, relay || undefined, network); setSelected(room.id) })}>{ft('Connect to sender')}</Button></Group>{scanning && <PairingScanner onCode={scanned} onClose={closeScanner} />}</Stack></Card>
    <Button variant="subtle" onClick={() => setNetworkOpen(!networkOpen)}>{ft('Connection options')}</Button>
    <Collapse in={networkOpen}><Stack gap="sm"><Text size="sm">{ft('STUN tries a direct connection. TURN relays encrypted traffic when direct connections are blocked. Configure TURN on both devices; credentials stay in this panel and are never added to the QR code.')}</Text><TextInput label={ft('Custom signaling relay (optional)')} value={relay} maxLength={300} onChange={event => setRelay(event.currentTarget.value)} /><TextInput label={ft('TURN relay address (optional)')} value={turnUrl} maxLength={300} onChange={event => setTurnUrl(event.currentTarget.value)} /><TextInput label={ft('TURN username')} value={turnUsername} autoComplete="off" maxLength={512} onChange={event => setTurnUsername(event.currentTarget.value)} /><PasswordInput label={ft('TURN password')} value={turnCredential} autoComplete="new-password" maxLength={2048} onChange={event => setTurnCredential(event.currentTarget.value)} /><Checkbox checked={relayOnly} label={ft('Use TURN relay only')} onChange={event => setRelayOnly(event.currentTarget.checked)} /></Stack></Collapse>
    {!!rooms.length && <Select label={ft('Direct transfers')} data={rooms} value={selected} onChange={value => { if (!busy) setSelected(value || '') }} disabled={busy} comboboxProps={{ withinPortal: false }} />}
    {host && <Card withBorder><Stack gap="sm"><Group justify="space-between"><Text fw={600}>{host.source.manifest.sessions[0].name}</Text><Badge color={host.status === 'complete' ? 'green' : 'blue'}>{ft(host.status === 'complete' ? 'Transfer complete' : 'Waiting for receiving device')}</Badge></Group>{host.status !== 'complete' && <><Image src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(host.code))} alt={ft('Direct transfer QR code')} w={240} maw="100%" mx="auto" /><Textarea label={ft('Direct transfer code')} value={host.code} readOnly autosize maxRows={4} /><Button leftSection={<IconCopy size={16} />} variant="default" onClick={() => void copyToClipboard(host.code)}>{ft('Copy pairing code')}</Button><Text size="xs">{ft('Open Sharing → Receive on the other device. Share this code only with the intended recipient.')}</Text></>}{host.peer && <><Text fw={500}>{host.peer.name}</Text><Text size="xs" style={{ overflowWrap: 'anywhere' }}>{ft('Participant ID')}: {host.peer.link.id}</Text>{!host.peer.admitted && <Button loading={busy} onClick={() => void run(() => sessionTransfers.admit(host.id))}>{ft('Allow transfer to this device')}</Button>}</>}<Text size="xs">{ft('Sent {{size}}', { size: size(host.sentBytes) })}</Text>{host.error && <Alert color="red">{ft(host.error)}</Alert>}<Button color="red" variant="light" onClick={() => sessionTransfers.stop(host.id)}>{ft(host.status === 'complete' ? 'Close transfer' : 'Stop transfer')}</Button></Stack></Card>}
    {guest && <Card withBorder><Stack gap="sm"><Badge>{ft({ connecting: 'Connecting…', waiting: 'Waiting for sender approval', ready: 'Ready to receive', receiving: 'Receiving', complete: 'Transfer complete', disconnected: 'Disconnected' }[guest.status])}</Badge>
      {manifest && guest.status !== 'complete' && <><Text fw={600}>{manifest.sessions.find(item => item.id === manifest.rootId)?.name}</Text><Text size="sm">{ft('{{sessions}} chats · {{files}} files · {{size}}', { sessions: manifest.sessions.length, files: manifest.objects.filter(item => item.kind === 'file').length, size: size(manifest.objects.reduce((sum, item) => sum + item.bytes, 0)) })}</Text><Select label={ft('Save received chat as')} value={mode} disabled={busy || comparing} data={[{ value: 'new', label: ft('New local chat') }, ...matches.map(item => ({ value: item.value, label: ft('Replace {{name}}', { name: item.label }) }))]} onChange={value => { setMode(value || 'new'); const match = matches.find(item => item.value === value); if (match) setFolderId(match.folderId || '') }} comboboxProps={{ withinPortal: false }} /><TextInput label={ft('Chat name')} value={chatName} disabled={busy} maxLength={240} onChange={event => setChatName(event.currentTarget.value)} /><Select label={ft('Receiving project')} value={folderId} disabled={busy} data={[{ value: '', label: ft('No project') }, ...(folders || []).map(folder => ({ value: folder.id, label: folder.name }))]} onChange={value => setFolderId(value || '')} comboboxProps={{ withinPortal: false }} />{protectedTransfer && <Alert color="yellow">{ft('This transfer contains protected content. Choose a protected project and unlock it to receive the copy.')}</Alert>}{mode !== 'new' && <><Alert color="blue">{ft('The complete received tree becomes the new copy. The previous local chat is archived only after success. Identical files are reused by SHA-256; locally changed files are never silently merged.')}</Alert><Checkbox checked={confirm} disabled={busy} label={ft('I reviewed replacement and want to keep the received version')} onChange={event => setConfirm(event.currentTarget.checked)} /></>}{analysis && <Text size="sm">{ft('Download {{download}} · reuse {{reuse}}', { download: size(analysis.plan.downloadBytes), reuse: size(analysis.plan.reusedBytes) })}{analysis.plan.locallyChanged.length ? ' · ' + ft('{{count}} locally changed items', { count: analysis.plan.locallyChanged.length }) : ''}</Text>}<Button loading={busy || comparing} disabled={!analysis || !chatName.trim() || mode !== 'new' && !confirm || guest.status === 'disconnected'} onClick={() => void receive()}>{ft(mode === 'new' ? 'Receive new chat' : 'Receive and replace local chat')}</Button></>}
      {busy && !!progress.total && <><Progress value={100 * progress.completed / progress.total} /><Text size="xs">{ft('Verified {{count}} of {{total}} items', { count: progress.completed, total: progress.total })}</Text></>}
      {guest.result && <><Text>{ft('The chat and its files are saved on this device.')}</Text>{guest.result.warning && <Alert color="yellow">{ft(guest.result.warning)}</Alert>}<Button onClick={() => switchCurrentSession(guest.result!.rootId)}>{ft('Open received chat')}</Button></>}
      {guest.error && <Alert color="red">{ft(guest.error)}</Alert>}<Button variant="default" onClick={() => { controller.current?.abort(); sessionTransfers.stop(guest.id) }}>{ft(guest.status === 'complete' ? 'Close transfer' : 'Cancel transfer')}</Button>
    </Stack></Card>}
    {error && <Alert color="red" role="alert">{ft(error)}</Alert>}{busy && <Button variant="subtle" onClick={() => controller.current?.abort()}>{ft('Cancel transfer')}</Button>}
  </Stack>
}
