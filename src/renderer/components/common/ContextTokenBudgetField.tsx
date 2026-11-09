import { Button, Group, NumberInput, Stack } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'
export function ContextTokenBudgetField({ value, placeholder, label, disabled, resetLabel = 'Use default', description = 'Empty uses the inherited budget. The model limit still applies.', onApply }: { value?: number; placeholder?: string; label: string; disabled?: boolean; resetLabel?: string; description?: string; onApply: (value: number | undefined) => void }) {
  useTranslation()
  const [draft, setDraft] = useState<string | number>(value ?? ''), [error, setError] = useState('')
  useEffect(() => { setDraft(value ?? ''); setError('') }, [value])
  const apply = () => {
    const next = draft === '' ? undefined : Number(draft)
    if (next !== undefined && (!Number.isInteger(next) || next < 1024 || next > 10_000_000)) { setError(ft('Enter a token budget between 1,024 and 10,000,000.')); return }
    setError(''); onApply(next)
  }
  return <Stack gap="xs" onClick={event => event.stopPropagation()}><NumberInput label={label} description={ft(description)} placeholder={placeholder} value={draft} onChange={setDraft} allowDecimal={false} min={1024} max={10_000_000} thousandSeparator="," clampBehavior="blur" error={error} disabled={disabled} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); apply() } }} /><Group gap="xs"><Button size="xs" variant="light" disabled={disabled} onClick={apply}>{ft('Apply')}</Button><Button size="xs" variant="subtle" disabled={disabled || value === undefined && draft === ''} onClick={() => { setDraft(''); setError(''); onApply(undefined) }}>{ft(resetLabel)}</Button></Group></Stack>
}
