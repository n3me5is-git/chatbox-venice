import { Alert, Button, Checkbox, Group, PasswordInput, Stack } from '@mantine/core'
import { LocalMCPClientTokenSchema } from '@shared/local-mcp'
import { forkT as ft } from '@/i18n/fork'

export function newMCPAccessToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function MCPAccessToken({ value, onChange, remember, onRemember, busy }: {
  value: string
  onChange?: (value: string) => void
  remember?: boolean
  onRemember?: (value: boolean) => void
  busy?: boolean
}) {
  return (
    <Stack gap="xs">
      <PasswordInput
        label={ft('Local MCP access token')}
        value={value}
        readOnly={!onChange}
        disabled={busy}
        autoComplete="off"
        maxLength={256}
        onChange={event => {
          onChange?.(event.currentTarget.value)
          onRemember?.(true)
        }}
        error={onChange && !LocalMCPClientTokenSchema.safeParse(value).success
          ? ft('Enter a valid bearer token without spaces, or leave the field empty for local access without authentication.')
          : undefined}
      />
      {value === '' && <Alert color="yellow">{ft('No bearer token. Any local process can use this endpoint’s granted permissions.')}</Alert>}
      {onChange && (
        <Group justify="space-between" gap="xs">
          <Checkbox
            label={ft('Keep the same token across restarts')}
            checked={remember}
            disabled={busy}
            onChange={event => onRemember?.(event.currentTarget.checked)}
          />
          <Button size="compact-sm" variant="light" disabled={busy} onClick={() => onChange(newMCPAccessToken())}>
            {ft('Regenerate token')}
          </Button>
        </Group>
      )}
    </Stack>
  )
}
