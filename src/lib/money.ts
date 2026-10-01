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
    return (
      new Intl.NumberFormat(currentLocale(), {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
        .format(n)
        // Let long amounts wrap between the number and the currency code, not inside "UZS".
        .replace(/\u00a0(?=[A-Z]{3}$)/, ' ')
        .replace(/^([A-Z]{3})\u00a0/, '$1 ')
    )
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

/** Turn "so'm per 1 unit" (how the Central Bank publishes rates) into "units per 1 USD" (how the app stores them). */
function fromUzsPerUnit(uzsPerUnit: Record<string, number>) {
  const usd = uzsPerUnit.USD
  const rates: Record<string, number> = { USD: 1, UZS: usd }
  for (const [ccy, uzs] of Object.entries(uzsPerUnit)) if (uzs > 0 && ccy !== 'USD') rates[ccy] = usd / uzs
  return rates
}

/** Official rates of the Central Bank of Uzbekistan, saved with the website a few times a day (rates.json). */
async function fetchCbuRates(): Promise<boolean> {
  const res = await fetch(`./rates.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return false
  const data = await res.json()
  if (data?.source !== 'cbu' || !data.uzsPerUnit?.USD) return false
  setRates(fromUzsPerUnit(data.uzsPerUnit), 'cbu', data.date ?? null)
  return true
}

/** Backup source, used only if the Central Bank rates can't be loaded. */
async function fetchOtherRates(): Promise<boolean> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) return false
  const data = await res.json()
  if (data?.result !== 'success' || typeof data.rates !== 'object') return false
  setRates(data.rates as Record<string, number>, 'online')
  return true
}

/**
 * Get today's rates: the Central Bank of Uzbekistan first, another online source if that fails.
 * Inside a locked-down preview both requests are blocked and this returns false.
 */
export async function fetchRatesOnline(): Promise<boolean> {
  for (const get of [fetchCbuRates, fetchOtherRates]) {
    try {
      if (await get()) return true
    } catch {
      // try the next source
    }
  }
  return false
}
