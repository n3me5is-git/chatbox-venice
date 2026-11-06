import i18n from 'i18next'
/** Translate at render/call time; never capture a language when this module loads. */
export function forkT(key: string, options: Record<string, unknown> = {}): string {
  if (i18n.isInitialized) {
    const translated=String(i18n.t(key,{defaultValue:key,...options}))
    const diagnostic=translated===key?key.match(/^(.+) \(([A-Za-z0-9_]+)\)$/):null
    return diagnostic?String(i18n.t(diagnostic[1],{defaultValue:diagnostic[1]}))+' ('+diagnostic[2]+')':translated
  }
  return key.replace(/{{\s*(\w+)\s*}}/g, (_, name) => String(options[name] ?? ''))
}
