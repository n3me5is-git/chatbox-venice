import { Alert, Button, Code, Group, Stack, Text, Select, Switch } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CHATGPT_SUB_PROVIDER, type ChatGPTDeviceCode } from '@shared/oauth/chatgpt-subscription'
import { beginSubscriptionLogin, completeSubscriptionLogin, disconnectSubscription, subscriptionModels, pendingSubscriptionLogin, cancelSubscriptionLogin } from '@/packages/chatgpt-subscription/service'
import { forkT as ft } from '@/i18n/fork'
import { useProviderSettings } from '@/stores/settingsStore'
import { ChatGPTAllowance } from './ChatGPTAllowance'
import { openSubscriptionLoginPage } from '@/packages/chatgpt-subscription/browser'
import { copyToClipboard } from '@/packages/navigator'
import { mergeSubscriptionModels, subscriptionDefaultModels, DEFAULT_SUBSCRIPTION_IMAGE_DRIVER } from '@shared/oauth/chatgpt-model-catalog'

export function ChatGPTSubscriptionSettings() {
  useTranslation()
  const { providerSettings, setProviderSettings } = useProviderSettings(CHATGPT_SUB_PROVIDER)
  const [code, setCode] = useState<ChatGPTDeviceCode>(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const abort = useRef<AbortController>()
  const attempt = useRef(0)
  const refreshModels = async () => {
    const models = await subscriptionModels()
    setProviderSettings({ models: mergeSubscriptionModels(providerSettings?.models || [], models), catalogModels: models })
  }
  const waitForLogin = async (pending: ChatGPTDeviceCode, controller: AbortController, version: number) => {
    try {
      await completeSubscriptionLogin(pending, controller.signal)
      if (controller.signal.aborted || attempt.current !== version) return
      setCode(undefined)
      try { await refreshModels() } catch { setError(ft('Connected. The model catalog could not be refreshed. Use Refresh account models to try again.')) }
    } catch (error) {
      if (!controller.signal.aborted && attempt.current === version) setError(String((error as Error).message))
      // Keep the code and encrypted pending login after a transient failure.
    } finally { if (attempt.current === version) setBusy(false) }
  }
  useEffect(() => {
    let active = true
    const version = attempt.current
    void pendingSubscriptionLogin().then(async pending => {
      if (!active || !pending || attempt.current !== version) return
      const controller = new AbortController(); abort.current = controller; setCode(pending); setBusy(true)
      await waitForLogin(pending, controller, version)
    }).catch(error => active && setError(error.message))
    return () => { active = false; abort.current?.abort() }
  }, [])
  const login = async () => {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    const version = ++attempt.current
    setBusy(true); setError('')
    try {
      const code = await beginSubscriptionLogin(controller.signal)
      if (controller.signal.aborted || attempt.current !== version) return
      setCode(code)
      // Show the code first. The user copies it before explicitly opening the browser.
      await waitForLogin(code, controller, version)
    }
    catch (reason) { if (!controller.signal.aborted) setError(String((reason as Error).message)) }
    finally { if (abort.current === controller) setBusy(false) }
  }
  return <Stack gap="sm">
    <ChatGPTAllowance />
    <Text size="sm">{ft('Use ChatGPT on this device without Codex or an API key. Tokens are encrypted in app storage and are excluded from provider settings exports.')}</Text>
    <Alert color="yellow">{ft('Community integration: text and image access depend on your account and may change. Subscription limits apply. No automatic switch to paid API billing.')}</Alert>
    {error && <Alert color="red" role="alert">{ft(error)}</Alert>}
    <Group wrap="wrap"><Button loading={busy} onClick={() => void login()}>{ft(providerSettings?.oauth ? 'Reconnect ChatGPT' : 'Sign in with ChatGPT')}</Button>{providerSettings?.oauth && <Button variant="default" onClick={() => { abort.current?.abort(); void disconnectSubscription().catch(error => setError(error.message)) }}>{ft('Disconnect')}</Button>}</Group>
    {code && <Stack gap="xs"><Text>{ft('Copy this code, then open your external browser. Return here after approving the login.')}</Text><Code fz="xl" style={{ userSelect: 'text', overflowWrap: 'anywhere' }}>{code.userCode}</Code><Text size="xs" c="dimmed">{ft('Login code expires at')}: {new Date(code.expiresAt).toLocaleTimeString()}</Text><Text size="xs">{ft('Enter this code in the browser. Only approve a login you started here.')}</Text><Group wrap="wrap"><Button variant="default" onClick={() => copyToClipboard(code.userCode)}>{ft('Copy login code')}</Button><Button variant="light" onClick={() => { void openSubscriptionLoginPage().catch(reason => setError(String(reason.message))) }}>{ft('Open external browser')}</Button>{!busy && <Button variant="light" onClick={() => { const controller = new AbortController(); abort.current = controller; const version = ++attempt.current; setBusy(true); setError(''); void waitForLogin(code, controller, version) }}>{ft('Continue sign-in')}</Button>}<Button variant="default" onClick={() => { attempt.current++; abort.current?.abort(); void cancelSubscriptionLogin().catch(reason => setError(reason.message)); setBusy(false); setCode(undefined) }}>{ft('Cancel')}</Button></Group></Stack>}
    {providerSettings?.oauth && <Button variant="light" onClick={async () => { setError(''); try { await refreshModels() } catch (reason) { setError(String((reason as Error).message)) } }}>{ft('Refresh account models')}</Button>}
    <Select comboboxProps={{ withinPortal: false }} searchable allowDeselect={false} label={ft('Image generation assistant model')} description={ft('This text model calls the image tool. The image renderer is selected separately in Create image.')} value={providerSettings?.subscriptionImageDriver || DEFAULT_SUBSCRIPTION_IMAGE_DRIVER} data={[...new Map([...subscriptionDefaultModels(), ...(providerSettings?.models || [])].filter(model => model.type !== 'image').map(model => [model.modelId, { value: model.modelId, label: model.nickname || model.modelId }])).values()]} onChange={value => value && setProviderSettings({ subscriptionImageDriver: value })} />
    <Text size="xs" c="dimmed">{ft('ChatGPT Images lets the subscription backend choose the image model. Add a custom image model and select its endpoint to request a specific model ID.')}</Text>
    <Switch label={ft('ChatGPT native web search')} description={ft('Search inside ChatGPT when the model needs it. Chatbox web search tools have a separate switch. Each chat can override this default.')} checked={providerSettings?.subscriptionWebSearch === true} onChange={event => setProviderSettings({ subscriptionWebSearch: event.currentTarget.checked })} />
  </Stack>
}
