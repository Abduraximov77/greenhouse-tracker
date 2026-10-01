import { currentLang, useDB } from './store'
import { currentLocale } from './i18n'

export function todayISO() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Browsers often lack Uzbek month names, so Uzbek dates are built by hand.
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
const UZ_DAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba']
const DATE_LOCALES = { en: 'en-GB', ru: 'ru-RU' } as const
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pad = (n: number) => String(n).padStart(2, '0')

function parse(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "2026-09-28" → "28 Sep 2026" (in the chosen language) */
export function formatDate(iso: string) {
  if (!iso) return '—'
  const dt = parse(iso)
  const lang = currentLang()
  if (lang === 'uz') return `${dt.getDate()}-${UZ_MONTHS[dt.getMonth()]}, ${dt.getFullYear()}`
  return dt.toLocaleDateString(DATE_LOCALES[lang], { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "2026-09-28" → "Monday, 28 September 2026" (for day headings) */
export function formatDayLong(iso: string) {
  const dt = parse(iso)
  const lang = currentLang()
  if (lang === 'uz') return `${cap(UZ_DAYS[dt.getDay()])}, ${dt.getDate()}-${UZ_MONTHS[dt.getMonth()]}, ${dt.getFullYear()}`
  return cap(dt.toLocaleDateString(DATE_LOCALES[lang], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
}

/** ISO timestamp → "28 Sep 2026, 02:15" */
export function formatDateTime(iso: string) {
  const dt = new Date(iso)
  const lang = currentLang()
  if (lang === 'uz') {
    return `${dt.getDate()}-${UZ_MONTHS[dt.getMonth()]}, ${dt.getFullYear()}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
  }
  return dt.toLocaleString(DATE_LOCALES[lang], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** "2026-09" → "September 2026" */
export function formatMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const lang = currentLang()
  if (lang === 'uz') return `${cap(UZ_MONTHS[m - 1])} ${y}`
  return cap(new Date(y, m - 1, 1).toLocaleDateString(DATE_LOCALES[lang], { month: 'long', year: 'numeric' }))
}

export function formatNumber(n: number | null | undefined, maxDigits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString(currentLocale(), { maximumFractionDigits: maxDigits })
}

export function round(n: number, digits = 2) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export const CURRENCIES = ['USD', 'EUR', 'UZS', 'KZT', 'KGS', 'TJS', 'RUB', 'CNY', 'TRY', 'AED']

export function makeMoney(currency: string, locale: string) {
  let fmt: Intl.NumberFormat
  try {
    fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 })
  } catch {
    fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  }
  return (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? '—' : fmt.format(n))
}

export function useMoney() {
  const s = useDB().settings
  return makeMoney(s.currency, currentLocale())
}
