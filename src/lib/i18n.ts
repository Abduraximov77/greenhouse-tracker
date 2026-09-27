import { useDB, currentLang, type Lang } from './store'
import { ru } from './i18n.ru'
import { uz } from './i18n.uz'

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'uz', label: "O'zbekcha" },
]

const DICTS: Record<Lang, Record<string, string>> = { en: {}, ru, uz }

export const LOCALES: Record<Lang, string> = { en: 'en-GB', ru: 'ru-RU', uz: 'uz-Latn-UZ' }

/** Locale for numbers. Browsers often lack Uzbek data; Uzbek uses the same number style as Russian (1 500,5). */
const NUMBER_LOCALES: Record<Lang, string> = { en: 'en-GB', ru: 'ru-RU', uz: 'ru-RU' }

export type Vars = Record<string, string | number>
export type T = (key: string, vars?: Vars) => string

/** English text is the key; other languages look it up. {name} placeholders are filled from vars. */
export function translate(lang: Lang, key: string, vars?: Vars) {
  const s = DICTS[lang][key] ?? key
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s
}

export function useT(): T {
  const lang = useDB().settings.lang
  return (key, vars) => translate(lang, key, vars)
}

/** Translate outside React (uses the current language). */
export function tNow(key: string, vars?: Vars) {
  return translate(currentLang(), key, vars)
}

/** Locale used for numbers and money. */
export function currentLocale() {
  return NUMBER_LOCALES[currentLang()]
}
