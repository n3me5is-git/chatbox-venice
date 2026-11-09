import platform from '@/platform'

export const CHATGPT_DEVICE_LOGIN_URL = 'https://auth.openai.com/codex/device'

/** Device authentication must leave the embedded browser on Android. */
export async function openSubscriptionLoginPage() {
  if (platform.type === 'mobile') {
    const { AppLauncher } = await import('@capacitor/app-launcher')
    const result = await AppLauncher.openUrl({ url: CHATGPT_DEVICE_LOGIN_URL })
    if (result.completed === false) throw Error('Could not open the external browser. Open auth.openai.com/codex/device in your browser.')
    return
  }
  await platform.openLink(CHATGPT_DEVICE_LOGIN_URL)
}
