import i18n from 'i18next'
/** Translate at render/call time; never capture a language when this module loads. */
export function forkT(key: string, options: Record<string, unknown> = {}): string {
  if (i18n.isInitialized) return String(i18n.t(key, { defaultValue: key, ...options }))
  return key.replace(/{{\s*(\w+)\s*}}/g, (_, name) => String(options[name] ?? ''))
}
