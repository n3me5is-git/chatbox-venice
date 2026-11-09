import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ type: 'mobile', external: vi.fn(), internal: vi.fn() }))
vi.mock('@/platform', () => ({ default: { get type() { return state.type }, openLink: (...args: any[]) => state.internal(...args) } }))
vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: { openUrl: (...args: any[]) => state.external(...args) } }))
import { CHATGPT_DEVICE_LOGIN_URL, openSubscriptionLoginPage } from './browser'
beforeEach(() => { state.type = 'mobile'; state.external.mockReset(); state.internal.mockReset() })
it('launches the external Android browser without the embedded Browser plugin', async () => {
  state.external.mockResolvedValue({ completed: true }); await openSubscriptionLoginPage()
  expect(state.external).toHaveBeenCalledWith({ url: CHATGPT_DEVICE_LOGIN_URL }); expect(state.internal).not.toHaveBeenCalled()
})
it('keeps an external-browser failure visible instead of falling back internally', async () => {
  state.external.mockResolvedValue({ completed: false }); await expect(openSubscriptionLoginPage()).rejects.toThrow('external browser'); expect(state.internal).not.toHaveBeenCalled()
})
it('uses the desktop system browser', async () => {
  state.type = 'desktop'; await openSubscriptionLoginPage(); expect(state.internal).toHaveBeenCalledWith(CHATGPT_DEVICE_LOGIN_URL); expect(state.external).not.toHaveBeenCalled()
})
