import { Alert, Button, Code, Group, Stack, Text } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CHATGPT_SUB_PROVIDER, type ChatGPTDeviceCode } from '@shared/oauth/chatgpt-subscription'
import { beginSubscriptionLogin, completeSubscriptionLogin, disconnectSubscription, subscriptionModels, pendingSubscriptionLogin, cancelSubscriptionLogin } from '@/packages/chatgpt-subscription/service'
import { forkT as ft } from '@/i18n/fork'
import platform from '@/platform'
import { useProviderSettings } from '@/stores/settingsStore'
import { ChatGPTAllowance } from './ChatGPTAllowance'

export function ChatGPTSubscriptionSettings() {
  useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings(CHATGPT_SUB_PROVIDER)
  const [code, setCode] = useState<ChatGPTDeviceCode>(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const abort = useRef<AbortController>()
  useEffect(() => {
    let active = true
    void pendingSubscriptionLogin().then(async pending => {
      if (!active || !pending) return
      const controller = new AbortController(); abort.current = controller; setCode(pending); setBusy(true)
      try { await completeSubscriptionLogin(pending, controller.signal) } catch (error) { if (!controller.signal.aborted) setError(String((error as Error).message)) }
      finally { if (active) { setBusy(false); setCode(undefined) } }
    }).catch(error => active && setError(error.message))
    return () => { active = false; abort.current?.abort() }
  }, [])
  const login = async () => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    setBusy(true); setError('')
    try { const code = await beginSubscriptionLogin(controller.signal); setCode(code); await platform.openLink('https://auth.openai.com/codex/device'); await completeSubscriptionLogin(code, controller.signal); setCode(undefined) }
    catch (reason) { if (!controller.signal.aborted) setError(String((reason as Error).message)) }
    finally { if (abort.current === controller) { setBusy(false); setCode(undefined) } }
  }
  return <Stack gap="sm">
    <ChatGPTAllowance />
    <Text size="sm">{ft('Use ChatGPT on this device without Codex or an API key. Tokens are encrypted in app storage and are excluded from provider settings exports.')}</Text>
    <Alert color="yellow">{ft('Community integration: text and image access depend on your account and may change. Subscription limits apply. No automatic switch to paid API billing.')}</Alert>
    {error && <Alert color="red" role="alert">{ft(error)}</Alert>}
    <Group wrap="wrap"><Button loading={busy} onClick={() => void login()}>{ft(providerSettings?.oauth ? 'Reconnect ChatGPT' : 'Sign in with ChatGPT')}</Button>{providerSettings?.oauth && <Button variant="default" onClick={() => { abort.current?.abort(); void disconnectSubscription().catch(error => setError(error.message)) }}>{ft('Disconnect')}</Button>}</Group>
    {code && <Stack gap="xs"><Text>{ft('Enter this code in the browser. Only approve a login you started here.')}</Text><Code fz="xl">{code.userCode}</Code><Group><Button variant="light" onClick={() => void platform.openLink('https://auth.openai.com/codex/device')}>{ft('Open login page')}</Button><Button variant="default" onClick={() => { abort.current?.abort(); void cancelSubscriptionLogin(); setBusy(false); setCode(undefined) }}>{ft('Cancel')}</Button></Group></Stack>}
    {providerSettings?.oauth && <Button variant="light" onClick={async () => { setError(''); try { setProviderSettings({ models: await subscriptionModels() }) } catch (reason) { setError(String((reason as Error).message)) } }}>{ft('Refresh account models')}</Button>}
  </Stack>
}
