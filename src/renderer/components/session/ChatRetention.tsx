import { ActionIcon, Button, Group, Menu, Modal, Select, Stack, Text, Tooltip } from '@mantine/core'
import { IconClock, IconDeviceFloppy, IconHourglass } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
import { retentionHours, type RetentionHours } from '@/packages/chat-retention/journal'
import { saveTemporaryChat, useRetainedChat } from '@/packages/chat-retention/retention'
import { add as addToast } from '@/stores/toastActions'

export function TemporaryChatToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  useTranslation()
  return (
    <Button variant={enabled ? 'light' : 'subtle'} size="compact-sm" leftSection={<IconHourglass size={17} />}
      aria-pressed={enabled} onClick={() => onChange(!enabled)}>
      {ft('Temporary chat')}
    </Button>
  )
}

export function ChatRetentionAction({ sessionId }: { sessionId: string }) {
  const { i18n } = useTranslation()
  const entry = useRetainedChat(sessionId)
  const [selecting, setSelecting] = useState(false)
  const [hours, setHours] = useState<RetentionHours>(24)
  const [busy, setBusy] = useState(false)
  if (!entry || entry.deleting) return null

  if (entry.expiresAt !== undefined && !entry.saving) {
    const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(entry.expiresAt)
    const label = ft('Chat expires {{date}}', { date })
    return (
      <Tooltip label={label} withArrow>
        <ActionIcon variant="subtle" size="lg" aria-label={label} onClick={() => addToast(label)}>
          <IconClock size={19} />
        </ActionIcon>
      </Tooltip>
    )
  }

  const save = async (period?: RetentionHours) => {
    setBusy(true)
    try {
      await saveTemporaryChat(sessionId, period)
      setSelecting(false)
    } catch {
      addToast(ft('Unable to save this temporary chat. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const number = new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'hour', unitDisplay: 'long' })
  const days = new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'day', unitDisplay: 'long' })
  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="light" size="lg" aria-label={ft('Save temporary chat')} title={ft('Save temporary chat')} disabled={busy}>
            <IconDeviceFloppy size={19} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{ft('Save temporary chat')}</Menu.Label>
          <Menu.Item leftSection={<IconDeviceFloppy size={16} />} onClick={() => void save()}>{ft('Save as a standard chat')}</Menu.Item>
          <Menu.Item leftSection={<IconClock size={16} />} onClick={() => setSelecting(true)}>{ft('Save as an expiring chat')}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal opened={selecting} onClose={() => setSelecting(false)} title={ft('Save as an expiring chat')}>
        <Stack gap="md">
          <Select label={ft('Keep this chat for')} allowDeselect={false} value={String(hours)}
            data={retentionHours.map(value => ({ value: String(value), label: value < 24 ? number.format(value) : days.format(value / 24) }))}
            onChange={value => { if (value) setHours(Number(value) as RetentionHours) }} comboboxProps={{ withinPortal: false }} />
          <Text size="sm" c="dimmed">{ft('At expiry, Chatbox deletes the chat and its app files. Files in linked folders stay where they are.')}</Text>
          <Group justify="end">
            <Button variant="default" disabled={busy} onClick={() => setSelecting(false)}>{ft('Cancel')}</Button>
            <Button loading={busy} onClick={() => void save(hours)}>{ft('Save chat')}</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
