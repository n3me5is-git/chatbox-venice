import { Accordion, Textarea } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { forkT as ft } from '@/i18n/fork'

export function NegativePromptField({ value, onChange, maxLength }: {
  value: string
  onChange: (value: string) => void
  maxLength?: number
}) {
  useTranslation()
  return <Accordion defaultValue={value ? 'negative' : null} variant="default">
    <Accordion.Item value="negative">
      <Accordion.Control py={6}>{ft(value ? 'Negative prompt' : 'Add negative prompt')}</Accordion.Control>
      <Accordion.Panel>
        <Textarea label={ft('Elements to avoid')} placeholder={ft('For example: text, blur, background objects…')} value={value}
          onChange={event => onChange(event.currentTarget.value)} maxLength={maxLength} autosize minRows={2} maxRows={5} />
      </Accordion.Panel>
    </Accordion.Item>
  </Accordion>
}
