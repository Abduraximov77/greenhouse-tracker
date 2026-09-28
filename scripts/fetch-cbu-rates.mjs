// Fetches today's official exchange rates from the Central Bank of Uzbekistan (cbu.uz)
// and saves them as public/rates.json, which is published together with the website.
// The bank's feed can't be read from a browser directly, so this runs while the site is built.
import { writeFileSync } from 'node:fs'

const URL = process.env.CBU_URL || 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/'

try {
  const res = await fetch(URL, { headers: { 'User-Agent': 'AgroLedger rates' }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const list = await res.json()
  // Each entry: { Ccy: 'USD', Nominal: '1', Rate: '11825.40', Date: '26.09.2026' } — so'm for `Nominal` units.
  const uzsPerUnit = {}
  let date = null
  for (const r of list) {
    const rate = Number(r.Rate) / Number(r.Nominal || 1)
    if (r.Ccy && rate > 0) uzsPerUnit[r.Ccy] = rate
    date ??= r.Date
  }
  if (!uzsPerUnit.USD) throw new Error('no USD rate in the feed')
  writeFileSync('public/rates.json', JSON.stringify({ source: 'cbu', date, fetchedAt: new Date().toISOString(), uzsPerUnit }, null, 1))
  console.log(`CBU rates saved for ${date}: 1 USD = ${uzsPerUnit.USD} UZS, 1 RUB = ${uzsPerUnit.RUB} UZS`)
} catch (err) {
  // The site still works: the app falls back to another online source.
  console.warn(`Could not get CBU rates (${err.message}); publishing without rates.json`)
}
