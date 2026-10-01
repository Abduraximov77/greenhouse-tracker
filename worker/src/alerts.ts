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
      now: {
        temp: j.current.temperature_2m,
        code: j.current.weather_code,
        wind: j.current.wind_speed_10m,
        humidity: j.current.relative_humidity_2m ?? null,
        time: j.current.time,
      },
      days,
      hours,
    }
  } catch {
    return null
  }
}

/** Places of a farm and the crops in each, from the shared records (the latest season that has crops). */
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
    let d: Record<string, unknown> | null = null
    try {
      d = JSON.parse(r.data)
    } catch {
      continue
    }
    if (!d || typeof d !== 'object') continue
    if (r.coll === 'meta') main = (d.value as Place) ?? null
    else if (r.coll === 'seasons' && typeof d.id === 'string') seasons.set(d.id, Number(d.startYear))
    else if (r.coll === 'crops' && typeof d.seasonId === 'string') crops.push(d as unknown as (typeof crops)[number])
  }
  // like the app: the newest season that has crops (a "2026" greenhouse season still counts in January)
  const withCrops = crops.map((c) => seasons.get(c.seasonId)).filter((y): y is number => Number.isFinite(y))
  const current = withCrops.length ? Math.max(...withCrops) : null
  const out: { place: Place; crops: string[] }[] = []
  const add = (p: Place | null | undefined, crop?: string) => {
    if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') return
    let e = out.find((x) => samePlace(x.place, p))
    if (!e) out.push((e = { place: { ...p, name: String(p.name ?? '') }, crops: [] }))
    if (crop && !e.crops.includes(crop)) e.crops.push(crop)
  }
  add(main)
  for (const c of crops) if (current !== null && seasons.get(c.seasonId) === current) add(c.place ?? main, String(c.crop ?? ''))
  // places with no crop this season are only kept if they are the main place
  return out.filter((e) => e.crops.length || (main && samePlace(e.place, main)))
}

interface Member {
  id: number
  farm_id: string
  farm_name: string
  lang: Lang
  tz_offset: number
  alert_hour: number
}

export async function runAlerts(env: Env) {
  // everyone who wants alerts, in every farm, in one query
  const rows = await env.DB.prepare(
    `SELECT u.id, u.lang, u.tz_offset, u.alert_hour, m.farm_id, f.name AS farm_name
     FROM members m JOIN users u ON u.id = m.user_id JOIN farms f ON f.id = m.farm_id
     WHERE m.status = 'active' AND u.alerts_on = 1 AND u.can_message = 1`,
  ).all<Member>()
  const byFarm = new Map<string, Member[]>()
  for (const m of rows.results) byFarm.set(m.farm_id, [...(byFarm.get(m.farm_id) ?? []), m])
  if (!byFarm.size) return
  const yesterday = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
  const digestRows = await env.DB.prepare('SELECT user_id, day FROM digests WHERE day >= ?')
    .bind(yesterday)
    .all<{ user_id: number; day: string }>()
  const digested = new Set(digestRows.results.map((r) => `${r.user_id}|${r.day}`))
  const sentAll = await env.DB.prepare('SELECT user_id, farm_id, key FROM sent_alerts').all<{
    user_id: number
    farm_id: string
    key: string
  }>()
  const sentBy = new Map<string, Set<string>>()
  for (const r of sentAll.results) {
    const k = `${r.user_id}|${r.farm_id}`
    if (!sentBy.has(k)) sentBy.set(k, new Set())
    sentBy.get(k)!.add(r.key)
  }

  const forecasts = new Map<string, Forecast | null>()
  for (const [farmId, members] of byFarm) {
    // one farm's bad data or a failed send never stops the alerts of the other farms
    try {
      await farmAlerts(env, { id: farmId, name: members[0].farm_name }, members, forecasts, digested, sentBy)
    } catch (e) {
      console.log('alerts failed for a farm', farmId, String(e))
    }
  }
  // forget old "already sent" notes
  const old = new Date(Date.now() - 5 * 86400000).toISOString()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sent_alerts WHERE sent_at < ?').bind(old),
    env.DB.prepare('DELETE FROM digests WHERE day < ?').bind(old.slice(0, 10)),
  ])
}

async function farmAlerts(
  env: Env,
  farm: { id: string; name: string },
  members: Member[],
  forecasts: Map<string, Forecast | null>,
  digested: Set<string>,
  sentBy: Map<string, Set<string>>,
) {
  {
    // who is due: the evening message (at the chosen hour, or later that day if it could not go out),
    // or only urgent ones between 06 and 23
    const nowMs = Date.now()
    const due = members
      .map((m) => {
        const local = new Date(nowMs + m.tz_offset * 60000)
        const hour = local.getUTCHours()
        const day = local.toISOString().slice(0, 10)
        const evening = hour >= m.alert_hour && !digested.has(`${m.id}|${day}|${farm.id}`)
        return { m, hour, day, evening }
      })
      .filter((x) => x.evening || (x.hour >= 6 && x.hour <= 23))
    if (!due.length) return

    const places = await farmPlaces(env, farm.id)
    if (!places.length) return
    const perPlace: { place: Place; crops: string[]; alerts: Alert[]; today: string }[] = []
    for (const p of places) {
      const key = `${p.place.lat},${p.place.lon}`
      if (!forecasts.has(key)) forecasts.set(key, await fetchForecast(p.place))
      const f = forecasts.get(key)
      if (f)
        perPlace.push({
          ...p,
          alerts: evaluateAlerts(f),
          today: new Date(Date.now() + (f.utcOffset ?? 0) * 1000).toISOString().slice(0, 10),
        })
    }

    for (const { m, day, evening } of due) {
      const sent = sentBy.get(`${m.id}|${farm.id}`) ?? new Set<string>()
      const lang: Lang = (['uz', 'ru', 'en'] as const).includes(m.lang) ? m.lang : 'uz'
      const t = tr(lang)
      const fmt = (n: number) => n.toLocaleString(NUM_LOCALE[lang], { maximumFractionDigits: 1 })
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
          // today/tomorrow at the farm's place (the person may be in another time zone)
          const dayWord = a.date === pp.today ? t('Today') : t('Tomorrow')
          return `${RULES_BY_ID[a.rule].icon} <b>${esc(dayWord)}</b>: ${esc(alertText(a, t, fmt))}`
        })
        blocks.push(`📍 <b>${esc(pp.place.name)}</b>${crops ? ' · ' + esc(crops) : ''}\n` + lines.join('\n'))
      }
      let sentOk = true
      if (blocks.length) {
        const head = evening
          ? `🌦 <b>${esc(farm.name)}</b> — ${esc(t('Weather warnings'))}`
          : `⚠ <b>${esc(farm.name)}</b> — ${esc(t('Weather warnings'))}`
        const r = await tg(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
          chat_id: m.id,
          parse_mode: 'HTML',
          text: head + '\n\n' + blocks.join('\n\n'),
          disable_web_page_preview: true,
        })
        sentOk = r.ok
        if (!r.ok && r.error_code === 403) {
          await env.DB.prepare('UPDATE users SET can_message = 0 WHERE id = ?').bind(m.id).run()
          continue
        }
        if (r.ok && newKeys.length) {
          const t0 = now()
          await env.DB.batch(
            newKeys.map((k) =>
              env.DB.prepare('INSERT OR IGNORE INTO sent_alerts (user_id, farm_id, key, sent_at) VALUES (?, ?, ?, ?)').bind(
                m.id,
                farm.id,
                k,
                t0,
              ),
            ),
          )
        }
      }
      // the evening message counts as done for this farm only when it went out and every forecast was read
      if (evening && sentOk && perPlace.length === places.length)
        await env.DB.prepare('INSERT OR IGNORE INTO digests (user_id, day) VALUES (?, ?)').bind(m.id, `${day}|${farm.id}`).run()
    }
  }
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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
