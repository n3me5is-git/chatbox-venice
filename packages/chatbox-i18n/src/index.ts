import { forkEnglish, withForkTranslations } from './fork-resources'
import ar from './locales/ar/translation.json'
import de from './locales/de/translation.json'
import en from './locales/en/translation.json'
import es from './locales/es/translation.json'
import fr from './locales/fr/translation.json'
import itIT from './locales/it-IT/translation.json'
import ja from './locales/ja/translation.json'
import ko from './locales/ko/translation.json'
import nbNO from './locales/nb-NO/translation.json'
import ptPT from './locales/pt-PT/translation.json'
import ru from './locales/ru/translation.json'
import sv from './locales/sv/translation.json'
import tr from './locales/tr/translation.json'
import zhHans from './locales/zh-Hans/translation.json'
import zhHant from './locales/zh-Hant/translation.json'

export type TranslationKey = keyof (typeof en & typeof forkEnglish)
export { type I18nLanguage, languageNameMap, languages, supportedLanguages } from './languages'

export const translationResources = {
  en: { translation: withForkTranslations("en", en) },
  'zh-Hans': { translation: withForkTranslations("zh-Hans", zhHans) },
  'zh-Hant': { translation: withForkTranslations("zh-Hant", zhHant) },
  ja: { translation: withForkTranslations("ja", ja) },
  ko: { translation: withForkTranslations("ko", ko) },
  ru: { translation: withForkTranslations("ru", ru) },
  de: { translation: withForkTranslations("de", de) },
  fr: { translation: withForkTranslations("fr", fr) },
  'pt-PT': { translation: withForkTranslations("pt-PT", ptPT) },
  es: { translation: withForkTranslations("es", es) },
  ar: { translation: withForkTranslations("ar", ar) },
  'it-IT': { translation: withForkTranslations("it-IT", itIT) },
  sv: { translation: withForkTranslations("sv", sv) },
  'nb-NO': { translation: withForkTranslations("nb-NO", nbNO) },
  tr: { translation: withForkTranslations("tr", tr) },
} as const
