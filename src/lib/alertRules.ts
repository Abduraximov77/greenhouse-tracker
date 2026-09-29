import type { Forecast, HourWeather } from './weather'

/**
 * Weather alerts for greenhouses, worked out by fixed rules (no AI).
 * The same rules run in the app and, later, on the server that sends the Telegram alerts,
 * so the app and Telegram always say the same thing.
 *
 * Thresholds are the app's general settings for plastic/film greenhouses, not official norms.
 * All texts are English keys, translated through i18n.
 */

export type AlertLevel = 'danger' | 'warn' | 'info'

export type RuleId =
  | 'frost'
  | 'freezingRain'
  | 'cold'
  | 'sharpDrop'
  | 'heat'
  | 'warm'
  | 'dryWind'
  | 'dryAir'
  | 'wind'
  | 'hail'
  | 'storm'
  | 'snow'
  | 'heavyRain'
  | 'rain'
  | 'longRain'
  | 'fog'
  | 'diseaseRisk'
  | 'bigSwing'

export interface AlertRule {
  id: RuleId
  icon: string
  /** Name of the rule, for the guide. */
  name: string
  /** When it is sent, with the thresholds (for the guide). */
  when: string
  /** Levels it can have, strongest first (for the guide). */
  levels: AlertLevel[]
  /** The alert text; {placeholders} are filled from the forecast. */
  message: string
  /** What to do. */
  action: string
}

/** Every rule, in the order the guide shows them. */
export const ALERT_RULES: AlertRule[] = [
  {
    id: 'frost',
    icon: '🥶',
    name: 'Frost',
    when: 'Air temperature 0 °C or below.',
    levels: ['danger'],
    message: 'Frost: down to {t}°C.',
    action: 'Close the greenhouse in the evening and keep it heated at night; cover young plants.',
  },
  {
    id: 'freezingRain',
    icon: '🧊',
    name: 'Freezing rain, icy drizzle',
    when: 'Rain or drizzle that freezes on contact.',
    levels: ['danger'],
    message: 'Freezing rain or icy drizzle.',
    action: 'Keep the greenhouse closed and heated; remove ice from the roof carefully so the film does not tear.',
  },
  {
    id: 'cold',
    icon: '🌡️',
    name: 'Cold night',
    when: 'Temperature from 0 to 4 °C.',
    levels: ['warn'],
    message: 'Cold night: down to {t}°C.',
    action: 'Close vents and doors before sunset; have heating ready.',
  },
  {
    id: 'sharpDrop',
    icon: '📉',
    name: 'Sharp cooling',
    when: 'Tomorrow’s highest temperature is 8 °C or more below today’s.',
    levels: ['warn'],
    message: 'Sharp cooling: tomorrow up to {d}°C colder than today.',
    action: 'Close vents earlier in the afternoon and be ready to heat at night.',
  },
  {
    id: 'heat',
    icon: '🔥',
    name: 'Heat',
    when: '35 °C or more (38 °C or more is dangerous).',
    levels: ['danger', 'warn'],
    message: 'Heat: up to {t}°C.',
    action: 'Open all vents from early morning, shade the plants, water in the morning and evening.',
  },
  {
    id: 'warm',
    icon: '☀️',
    name: 'Hot inside the greenhouse',
    when: 'From 30 to 34 °C outside: inside a closed greenhouse it can pass 40 °C.',
    levels: ['info'],
    message: 'Warm day: up to {t}°C outside, much hotter inside a closed greenhouse.',
    action: 'Open vents by mid-morning and check the temperature inside at noon.',
  },
  {
    id: 'dryWind',
    icon: '🏜️',
    name: 'Hot dry wind (garmsel)',
    when: 'In the same hour: 30 °C or more, humidity 25% or less, gusts 30 km/h or more.',
    levels: ['danger'],
    message: 'Hot dry wind (garmsel): {t}°C, humidity {h}%, gusts {w} km/h ({from}–{to}).',
    action: 'Keep vents on the windward side closed, water well early in the morning, mist the plants or wet the paths.',
  },
  {
    id: 'dryAir',
    icon: '💨',
    name: 'Very dry air',
    when: 'Humidity 20% or less on a day of 25 °C or more.',
    levels: ['info'],
    message: 'Very dry air: humidity down to {h}%.',
    action: 'Plants lose water fast: water in the morning; misting or wetting the paths helps.',
  },
  {
    id: 'wind',
    icon: '🌬️',
    name: 'Strong wind',
    when: 'Gusts 45 km/h or more (60 km/h or more is dangerous).',
    levels: ['danger', 'warn'],
    message: 'Strong wind: gusts up to {w} km/h ({from}–{to}).',
    action: 'Close vents and doors, tie down the film, remove loose things around the greenhouse.',
  },
  {
    id: 'hail',
    icon: '🌨️',
    name: 'Thunderstorm with hail',
    when: 'The forecast shows a thunderstorm with hail.',
    levels: ['danger'],
    message: 'Thunderstorm with hail possible ({from}–{to}).',
    action: 'Close everything and secure the film; check the roof for damage afterwards.',
  },
  {
    id: 'storm',
    icon: '⛈️',
    name: 'Thunderstorm',
    when: 'The forecast shows a thunderstorm.',
    levels: ['warn'],
    message: 'Thunderstorm ({from}–{to}).',
    action: 'Close vents and doors, secure the film, do not work outside during lightning.',
  },
  {
    id: 'snow',
    icon: '❄️',
    name: 'Snow',
    when: 'Any snowfall.',
    levels: ['warn'],
    message: 'Snow expected ({from}–{to}).',
    action: 'Keep heating on so snow slides off; clear the roof so the film does not tear.',
  },
  {
    id: 'heavyRain',
    icon: '🌧️',
    name: 'Heavy rain',
    when: '10 mm or more in a day (25 mm or more is dangerous).',
    levels: ['danger', 'warn'],
    message: 'Heavy rain: {mm} mm ({from}–{to}).',
    action: 'Close vents, check the film for holes and clear the drains around the greenhouse.',
  },
  {
    id: 'rain',
    icon: '🌦️',
    name: 'Rain',
    when: 'From 0.3 to 10 mm in a day.',
    levels: ['info'],
    message: 'Rain: about {mm} mm ({from}–{to}).',
    action: 'Close vents before it starts; do not spray in the rain or just before it.',
  },
  {
    id: 'longRain',
    icon: '☔',
    name: 'Several rainy days',
    when: 'Rain of 1 mm or more on 3 or more days in a row.',
    levels: ['warn'],
    message: 'Rain {n} days in a row.',
    action: 'Damp air brings fungal disease: ventilate whenever the rain stops, water less, check the leaves.',
  },
  {
    id: 'fog',
    icon: '🌫️',
    name: 'Fog',
    when: 'The forecast shows fog.',
    levels: ['info'],
    message: 'Fog ({from}–{to}).',
    action: 'The air is very damp: ventilate once the fog lifts, do not wet the leaves.',
  },
  {
    id: 'diseaseRisk',
    icon: '🍂',
    name: 'Fungal disease risk',
    when: 'Humidity 90% or more for 6 hours or more, at 10–25 °C.',
    levels: ['warn'],
    message: 'Damp and mild: humidity over 90% for {n} hours at {range}°C.',
    action: 'Risk of grey mould and blight: ventilate in the morning, water only at the roots, remove sick leaves.',
  },
  {
    id: 'bigSwing',
    icon: '🌓',
    name: 'Big day–night difference',
    when: 'Day and night temperatures differ by 18 °C or more.',
    levels: ['info'],
    message: 'Warm day, cold night: {max}°C by day, {min}°C at night.',
    action: 'Dew forms on the film and leaves in the morning: open vents gradually after sunrise.',
  },
]

export const RULES_BY_ID = Object.fromEntries(ALERT_RULES.map((r) => [r.id, r])) as Record<RuleId, AlertRule>

export interface Alert {
  rule: RuleId
  date: string
  level: AlertLevel
  /** Values for the message placeholders. */
  vars: Record<string, string | number>
}

const HAIL = [96, 99]
const STORM = [95, 96, 99]
const SNOW = [71, 73, 75, 77, 85, 86]
const FREEZING = [56, 57, 66, 67]
const FOG = [45, 48]

const hh = (h: HourWeather) => h.time.slice(11, 16)
/** "17:00" → "18:00": the hour the last matching hour ends. */
const endOf = (h: HourWeather) => `${String((Number(h.time.slice(11, 13)) + 1) % 24).padStart(2, '0')}:00`
const span = (hs: HourWeather[]): Record<string, string> => (hs.length ? { from: hh(hs[0]), to: endOf(hs[hs.length - 1]) } : {})
const r0 = (n: number) => Math.round(n)
const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * The current hour at the place, "2026-09-30T14", using the clock now (not the time the forecast was fetched,
 * which can be up to an hour old). Falls back to the forecast's own time.
 */
export function placeNowHour(f: Forecast, now = Date.now()): string {
  if (typeof f.utcOffset === 'number') return new Date(now + f.utcOffset * 1000).toISOString().slice(0, 13)
  return f.now.time ? f.now.time.slice(0, 13) : ''
}

/**
 * Alerts for today and tomorrow (so each one comes a day before).
 * Today only counts the hours still ahead.
 */
export function evaluateAlerts(f: Forecast, days = 2): Alert[] {
  const out: Alert[] = []
  const nowHour = placeNowHour(f)
  // days from today at the place (a forecast fetched late last night still starts yesterday)
  const fDays = nowHour ? f.days.filter((d) => d.date >= nowHour.slice(0, 10)) : f.days
  const add = (rule: RuleId, date: string, level: AlertLevel, vars: Record<string, string | number> = {}) =>
    out.push({ rule, date, level, vars })

  fDays.slice(0, days).forEach((d, i) => {
    const all = (f.hours ?? []).filter((h) => h.time.startsWith(d.date))
    const hours = all.filter((h) => !nowHour || h.time.slice(0, 13) >= nowHour)
    const useHours = all.length > 0
    if (useHours && hours.length === 0) return // the day is over

    const temps = useHours ? hours.map((h) => h.temp) : [d.tMin, d.tMax]
    const tMin = Math.min(...temps)
    const tMax = Math.max(...temps)
    const gusts = useHours ? Math.max(...hours.map((h) => h.gusts)) : d.gusts
    const codes = useHours ? hours.map((h) => h.code) : [d.code]
    const hum = hours.map((h) => h.humidity).filter((x): x is number => x !== null)
    const rain = useHours ? hours.reduce((a, h) => a + h.rain, 0) : d.rain
    const wet = hours.filter((h) => h.rain >= 0.1)

    // --- cold ---
    if (codes.some((c) => FREEZING.includes(c))) add('freezingRain', d.date, 'danger')
    if (tMin <= 0) add('frost', d.date, 'danger', { t: r0(tMin) })
    else if (tMin <= 4) add('cold', d.date, 'warn', { t: r0(tMin) })
    if (i === 1 && fDays[0] && fDays[0].tMax - d.tMax >= 8) add('sharpDrop', d.date, 'warn', { d: r0(fDays[0].tMax - d.tMax) })

    // --- heat and dry air ---
    if (tMax >= 35) add('heat', d.date, tMax >= 38 ? 'danger' : 'warn', { t: r0(tMax) })
    else if (tMax >= 30) add('warm', d.date, 'info', { t: r0(tMax) })
    const dry = hours.filter((h) => h.temp >= 30 && h.humidity !== null && h.humidity <= 25 && h.gusts >= 30)
    if (dry.length) {
      const worst = dry.reduce((a, h) => (h.gusts > a.gusts ? h : a))
      add('dryWind', d.date, 'danger', { t: r0(worst.temp), h: r0(worst.humidity ?? 0), w: r0(worst.gusts), ...span(dry) })
    } else if (hum.length && Math.min(...hum) <= 20 && tMax >= 25) add('dryAir', d.date, 'info', { h: r0(Math.min(...hum)) })

    // --- wind ---
    if (gusts >= 45) {
      const windy = hours.filter((h) => h.gusts >= 45)
      add('wind', d.date, gusts >= 60 ? 'danger' : 'warn', { w: r0(gusts), ...span(windy) })
    }

    // --- storms, snow, rain ---
    const stormHours = hours.filter((h) => STORM.includes(h.code))
    const snowHours = hours.filter((h) => SNOW.includes(h.code))
    if (codes.some((c) => HAIL.includes(c))) add('hail', d.date, 'danger', span(stormHours))
    else if (codes.some((c) => STORM.includes(c))) add('storm', d.date, 'warn', span(stormHours))
    if (codes.some((c) => SNOW.includes(c)) || (d.snow ?? 0) > 0) add('snow', d.date, 'warn', span(snowHours))
    else if (rain >= 10) add('heavyRain', d.date, rain >= 25 ? 'danger' : 'warn', { mm: r1(rain), ...span(wet) })
    else if (rain >= 0.3) add('rain', d.date, 'info', { mm: r1(rain), ...span(wet) })

    // --- damp: fog, disease ---
    const fogHours = hours.filter((h) => FOG.includes(h.code))
    if (fogHours.length) add('fog', d.date, 'info', span(fogHours))
    const damp = hours.filter((h) => h.humidity !== null && h.humidity >= 90 && h.temp >= 10 && h.temp <= 25)
    if (damp.length >= 6) {
      const ts = damp.map((h) => h.temp)
      const lo = r0(Math.min(...ts))
      const hi = r0(Math.max(...ts))
      add('diseaseRisk', d.date, 'warn', { n: damp.length, range: lo === hi ? String(lo) : `${lo}–${hi}` })
    }
    if (d.tMax - d.tMin >= 18 && d.tMin > 0) add('bigSwing', d.date, 'info', { max: r0(d.tMax), min: r0(d.tMin) })
  })

  // Several rainy days in a row, starting today or tomorrow: said once, on the first day.
  let streak = 0
  for (const d of fDays) {
    if (d.rain >= 1) streak++
    else break
  }
  let start = 0
  if (streak < 3 && fDays[0] && fDays[0].rain < 1) {
    start = 1
    streak = 0
    for (const d of fDays.slice(1)) {
      if (d.rain >= 1) streak++
      else break
    }
  }
  if (streak >= 3 && fDays[start]) add('longRain', fDays[start].date, 'warn', { n: streak })

  const order = { danger: 0, warn: 1, info: 2 }
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.level] - order[b.level])
}

/**
 * The full text of an alert in the chosen language: what is coming, then what to do.
 * Hours that are not known are left out ("Heavy rain: 12 mm." instead of "(…–…)").
 */
export function alertText(
  a: Alert,
  t: (key: string, vars?: Record<string, string | number>) => string,
  /** How numbers are written, e.g. "1,2" in Uzbek and Russian. */
  num: (n: number) => string = String,
) {
  const rule = RULES_BY_ID[a.rule]
  const vars = Object.fromEntries(Object.entries(a.vars).map(([k, v]) => [k, typeof v === 'number' ? num(v) : v]))
  const msg = t(rule.message, vars).replace(/\s*\(\{from\}[–-]\{to\}\)/g, '')
  return `${msg} ${t(rule.action)}`
}
