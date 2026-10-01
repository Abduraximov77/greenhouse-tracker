/**
 * Telegram weather alerts, from the same fixed rules the app shows (src/lib/alertRules.ts). No AI.
 * Runs every hour:
 *  - at each person's chosen hour (default 19:00 their time): the evening message with everything for
 *    the rest of today and tomorrow, per place, naming the crops there;
 *  - any other hour (06–23 their time): only new "danger" alerts, straight away.
 * Nothing is sent twice.
 */
import { evaluateAlerts, alertText, RULES_BY_ID, type Alert } from '../../src/lib/alertRules'
import type { Forecast, DayWeather, HourWeather } from '../../src/lib/weather'
import { cropName } from '../../src/lib/crops'
import { uz } from '../../src/lib/i18n.uz'
import { ru } from '../../src/lib/i18n.ru'
import { tg, tgDocument } from './telegram'
import { now } from './util'
import type { Env } from './index'

type Lang = 'uz' | 'ru' | 'en'
const DICTS: Record<Lang, Record<string, string>> = { uz, ru, en: {} }
const tr = (lang: Lang) => (key: string, vars?: Record<string, string | number>) => {
  const s = DICTS[lang][key] ?? key
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s
}
const NUM_LOCALE: Record<Lang, string> = { uz: 'ru-RU', ru: 'ru-RU', en: 'en-GB' }

interface Place {
  name: string
  lat: number
  lon: number
}
const samePlace = (a: Place, b: Place) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01

async function fetchForecast(p: Place): Promise<Forecast | null> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${p.lat}&longitude=${p.lon}` +
    '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,snowfall_sum' +
    '&hourly=temperature_2m,weather_code,precipitation,precipitation_probability,wind_gusts_10m,relative_humidity_2m,is_day' +
    '&timezone=auto&forecast_days=3'
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const j = (await r.json()) as any
    const d = j.daily
    const h = j.hourly
    const days: DayWeather[] = (d.time as string[]).map((date, i) => ({
      date,
      code: d.weather_code[i] ?? 0,
      tMax: d.temperature_2m_max[i],
      tMin: d.temperature_2m_min[i],
      rain: d.precipitation_sum[i] ?? 0,
      rainChance: d.precipitation_probability_max?.[i] ?? null,
      gusts: d.wind_gusts_10m_max[i] ?? 0,
      snow: d.snowfall_sum?.[i] ?? 0,
    }))
    const hours: HourWeather[] = (h.time as string[]).map((time, i) => ({
      time,
      temp: h.temperature_2m[i],
      code: h.weather_code[i] ?? 0,
      rain: h.precipitation?.[i] ?? 0,
      rainChance: h.precipitation_probability?.[i] ?? null,
      gusts: h.wind_gusts_10m?.[i] ?? 0,
      humidity: h.relative_humidity_2m?.[i] ?? null,
      isDay: (h.is_day?.[i] ?? 1) === 1,
    }))
    return {
      fetchedAt: Date.now(),
      utcOffset: j.utc_offset_seconds,
      lat: p.lat,
      lon: p.lon,
      now: { temp: j.current.temperature_2m, code: j.current.weather_code, wind: j.current.wind_speed_10m, humidity: j.current.relative_humidity_2m ?? null, time: j.current.time },
      days,
      hours,
    }
  } catch {
    return null
  }
}

/** Places of a farm and the crops in each, from the shared records (this year's seasons). */
async function farmPlaces(env: Env, farmId: string): Promise<{ place: Place; crops: string[] }[]> {
  const rows = await env.DB.prepare(
    "SELECT coll, data FROM records WHERE farm_id = ? AND deleted = 0 AND (coll = 'crops' OR coll = 'seasons' OR (coll = 'meta' AND id = 'place'))",
  )
    .bind(farmId)
    .all<{ coll: string; data: string }>()
  let main: Place | null = null
  const seasons = new Map<string, number>()
  const crops: { seasonId: string; crop: string; place?: Place | null }[] = []
  for (const r of rows.results) {
    const d = JSON.parse(r.data)
    if (r.coll === 'meta') main = d?.value ?? null
    else if (r.coll === 'seasons') seasons.set(d.id, d.startYear)
    else crops.push(d)
  }
  const year = new Date().getUTCFullYear()
  const years = [...seasons.values()].filter((y) => y <= year)
  const current = years.length ? Math.max(...years) : year
  const out: { place: Place; crops: string[] }[] = []
  const add = (p: Place | null | undefined, crop?: string) => {
    if (!p || typeof p.lat !== 'number') return
    let e = out.find((x) => samePlace(x.place, p))
    if (!e) out.push((e = { place: p, crops: [] }))
    if (crop && !e.crops.includes(crop)) e.crops.push(crop)
  }
  add(main)
  for (const c of crops) if (seasons.get(c.seasonId) === current) add(c.place ?? main, c.crop)
  // places with no crop this season are only kept if they are the main place
  return out.filter((e) => e.crops.length || (main && samePlace(e.place, main)))
}

interface Member {
  id: number
  lang: Lang
  tz_offset: number
  alert_hour: number
}

export async function runAlerts(env: Env) {
  const farms = await env.DB.prepare('SELECT id, name FROM farms').all<{ id: string; name: string }>()
  const forecasts = new Map<string, Forecast | null>()
  for (const farm of farms.results) {
    const members = await env.DB.prepare(
      `SELECT u.id, u.lang, u.tz_offset, u.alert_hour FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.farm_id = ? AND m.status = 'active' AND u.alerts_on = 1 AND u.can_message = 1`,
    )
      .bind(farm.id)
      .all<Member>()
    if (!members.results.length) continue

    // who is due: evening message now, or only urgent ones
    const nowMs = Date.now()
    const due = members.results
      .map((m) => {
        const local = new Date(nowMs + m.tz_offset * 60000)
        const hour = local.getUTCHours()
        return { m, hour, day: local.toISOString().slice(0, 10) }
      })
      .filter((x) => x.hour === x.m.alert_hour || (x.hour >= 6 && x.hour <= 23))
    if (!due.length) continue

    const places = await farmPlaces(env, farm.id)
    if (!places.length) continue
    const perPlace: { place: Place; crops: string[]; alerts: Alert[] }[] = []
    for (const p of places) {
      const key = `${p.place.lat},${p.place.lon}`
      if (!forecasts.has(key)) forecasts.set(key, await fetchForecast(p.place))
      const f = forecasts.get(key)
      if (f) perPlace.push({ ...p, alerts: evaluateAlerts(f) })
    }

    for (const { m, hour, day } of due) {
      const evening = hour === m.alert_hour
      if (evening) {
        const done = await env.DB.prepare('SELECT 1 FROM digests WHERE user_id = ? AND day = ?').bind(m.id, day).first()
        if (done) continue
      }
      const sentRows = await env.DB.prepare('SELECT key FROM sent_alerts WHERE user_id = ? AND farm_id = ?').bind(m.id, farm.id).all<{ key: string }>()
      const sent = new Set(sentRows.results.map((r) => r.key))
      const lang: Lang = (['uz', 'ru', 'en'] as const).includes(m.lang) ? m.lang : 'uz'
      const t = tr(lang)
      const fmt = (n: number) => n.toLocaleString(NUM_LOCALE[lang], { maximumFractionDigits: 1 })
      const today = day
      const blocks: string[] = []
      const newKeys: string[] = []
      for (const pp of perPlace) {
        const list = pp.alerts.filter((a) => {
          const k = `${pp.place.lat},${pp.place.lon}|${a.date}|${a.rule}`
          if (sent.has(k)) return false
          if (!evening && a.level !== 'danger') return false
          newKeys.push(k)
          return true
        })
        if (!list.length) continue
        const crops = pp.crops.map((c) => cropName(c, lang)).join(', ')
        const lines = list.map((a) => {
          const dayWord = a.date === today ? t('Today') : t('Tomorrow')
          return `${RULES_BY_ID[a.rule].icon} <b>${esc(dayWord)}</b>: ${esc(alertText(a, t, fmt))}`
        })
        blocks.push(`📍 <b>${esc(pp.place.name)}</b>${crops ? ' · ' + esc(crops) : ''}\n` + lines.join('\n'))
      }
      if (blocks.length) {
        const head = evening ? `🌦 <b>${esc(farm.name)}</b> — ${esc(t('Weather warnings'))}` : `⚠ <b>${esc(farm.name)}</b> — ${esc(t('Weather warnings'))}`
        const r = await tg(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
          chat_id: m.id,
          parse_mode: 'HTML',
          text: head + '\n\n' + blocks.join('\n\n'),
          disable_web_page_preview: true,
        })
        if (!r.ok && r.error_code === 403) {
          await env.DB.prepare('UPDATE users SET can_message = 0 WHERE id = ?').bind(m.id).run()
          continue
        }
        if (r.ok && newKeys.length) {
          const t0 = now()
          await env.DB.batch(newKeys.map((k) => env.DB.prepare('INSERT OR IGNORE INTO sent_alerts (user_id, farm_id, key, sent_at) VALUES (?, ?, ?, ?)').bind(m.id, farm.id, k, t0)))
        }
      }
      if (evening) await env.DB.prepare('INSERT OR IGNORE INTO digests (user_id, day) VALUES (?, ?)').bind(m.id, day).run()
    }
  }
  // forget old "already sent" notes
  const old = new Date(Date.now() - 5 * 86400000).toISOString()
  await env.DB.prepare('DELETE FROM sent_alerts WHERE sent_at < ?').bind(old).run()
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Every Sunday evening: a copy of the whole farm, as a file, to each owner's Telegram. */
export async function weeklyBackups(env: Env) {
  const farms = await env.DB.prepare('SELECT id, name, code FROM farms').all<{ id: string; name: string; code: string }>()
  for (const f of farms.results) {
    const recs = await env.DB.prepare('SELECT coll, id, data, updated_at FROM records WHERE farm_id = ? AND deleted = 0').bind(f.id).all<{
      coll: string
      id: string
      data: string
      updated_at: string
    }>()
    if (!recs.results.length) continue
    const byColl: Record<string, unknown[]> = {}
    for (const r of recs.results) (byColl[r.coll] ??= []).push(JSON.parse(r.data))
    const file = JSON.stringify({ app: 'AgroLedger', farm: f.name, code: f.code, exportedAt: now(), records: byColl }, null, 1)
    const owners = await env.DB.prepare(
      "SELECT u.id FROM members m JOIN users u ON u.id = m.user_id WHERE m.farm_id = ? AND m.role = 'owner' AND m.status = 'active' AND u.can_message = 1",
    )
      .bind(f.id)
      .all<{ id: number }>()
    const date = new Date().toISOString().slice(0, 10)
    for (const o of owners.results) {
      await tgDocument(env.TELEGRAM_BOT_TOKEN, o.id, `agroledger-${f.code}-${date}.json`, file, `💾 AgroLedger · ${f.name} · ${date}`)
    }
  }
}
