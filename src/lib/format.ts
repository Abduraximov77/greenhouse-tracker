import { useDB } from './store'

export function todayISO() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "2026-09-28" → "28 Sep 2026" */
export function formatDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** ISO timestamp → "28 Sep 2026, 02:15" */
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatNumber(n: number | null | undefined, maxDigits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

export function round(n: number, digits = 2) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export const CURRENCIES = ['USD', 'EUR', 'UZS', 'KZT', 'KGS', 'TJS', 'RUB', 'CNY', 'TRY', 'AED']

export function makeMoney(currency: string) {
  let fmt: Intl.NumberFormat
  try {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 })
  } catch {
    fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
  }
  return (n: number | null | undefined) =>
    n === null || n === undefined || Number.isNaN(n) ? '—' : fmt.format(n)
}

export function useMoney() {
  return makeMoney(useDB().settings.currency)
}
