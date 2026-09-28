/**
 * Money in several currencies. Every amount is saved with its own currency;
 * totals are converted into the display currency using the saved exchange rates.
 */
import { setRates, useDB, type Settings } from './store'
import { currentLocale } from './i18n'

/** Convert an amount between currencies. Returns null when a rate is missing. */
export function convert(amount: number, from: string, to: string, rates: Settings['rates']): number | null {
  if (from === to) return amount
  const rf = rates[from]
  const rt = rates[to]
  if (!rf || !rt) return null
  return (amount / rf) * rt
}

export function formatMoney(n: number | null | undefined, currency: string) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  try {
    return new Intl.NumberFormat(currentLocale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
      .format(n)
      // Let long amounts wrap between the number and the currency code, not inside "UZS".
      .replace(/\u00a0(?=[A-Z]{3}$)/, ' ')
      .replace(/^([A-Z]{3})\u00a0/, '$1 ')
  } catch {
    return `${n.toLocaleString(currentLocale(), { maximumFractionDigits: 2 })} ${currency}`
  }
}

/** Adds up amounts in mixed currencies into one currency. `missing` is true if a rate was needed but not set. */
export function sumIn(items: { amount: number | null; currency: string }[], to: string, rates: Settings['rates']) {
  let total = 0
  let missing = false
  for (const it of items) {
    if (!it.amount) continue
    const v = convert(it.amount, it.currency, to, rates)
    if (v === null) missing = true
    else total += v
  }
  return { total, missing }
}

export function useCurrency() {
  const s = useDB().settings
  const display = s.currency
  const rates = s.rates
  /** Format an amount in its own currency. */
  const fmt = (n: number | null | undefined, currency: string = display) => formatMoney(n, currency)
  /** Amount in its own currency, plus the converted value when it differs from the display currency. */
  const both = (n: number | null | undefined, currency: string) => {
    if (n === null || n === undefined) return '—'
    if (currency === display) return fmt(n, currency)
    const c = convert(n, currency, display, rates)
    return c === null ? fmt(n, currency) : `${fmt(n, currency)} (≈ ${fmt(c, display)})`
  }
  return { display, rates, fmt, both, sum: (items: { amount: number | null; currency: string }[]) => sumIn(items, display, rates) }
}

/**
 * Try to fetch today's rates online. Works when the site is hosted on its own address;
 * inside a locked-down preview the request is blocked and this returns false.
 */
export async function fetchRatesOnline(): Promise<boolean> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) return false
    const data = await res.json()
    if (data?.result !== 'success' || typeof data.rates !== 'object') return false
    setRates(data.rates as Record<string, number>, 'online')
    return true
  } catch {
    return false
  }
}
