import { useEffect, useState } from 'react'
import type { DB, Lang, Place, SeasonCrop } from './store'

/**
 * Weather from Open-Meteo (no key needed). Its free plan is for non-commercial use;
 * if AgroLedger is ever sold to other farms, a paid Open-Meteo plan is needed.
 */

export interface DayWeather {
  date: string
  code: number
  tMax: number
  tMin: number
  rain: number // mm
  rainChance: number | null // %
  gusts: number // km/h
  snow?: number // cm
}

export interface HourWeather {
  time: string // "2026-09-29T14:00" (local time of the place)
  temp: number
  code: number
  rain: number // mm in that hour
  rainChance: number | null // %
  gusts: number // km/h
  humidity: number | null
  isDay: boolean
}

export interface Forecast {
  fetchedAt: number
  /** The place's time zone offset from UTC, in seconds (e.g. 18000 for Uzbekistan). */
  utcOffset?: number
  lat: number
  lon: number
  now: { temp: number; code: number; wind: number; humidity: number | null; time?: string; isDay?: boolean }
  days: DayWeather[]
  hours: HourWeather[]
}

const CACHE_KEY = 'agroledger:weather3'
const CACHE_MS = 60 * 60 * 1000 // refresh at most once an hour

const placeKey = (p: { lat: number; lon: number }) => `${p.lat},${p.lon}`

// One forecast per place; several places are kept at once (a farm can have crops in different towns).
function readAll(): Record<string, Forecast> {
  try {
    return (JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Record<string, Forecast> | null) ?? {}
  } catch {
    return {}
  }
}

export function readCachedForecast(p: Place): Forecast | null {
  return readAll()[placeKey(p)] ?? null
}

function writeCache(f: Forecast) {
  try {
    const all = readAll()
    all[placeKey(f)] = f
    // keep only the 12 newest places
    const keep = Object.entries(all)
      .sort((a, b) => b[1].fetchedAt - a[1].fetchedAt)
      .slice(0, 12)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch {
    // no storage
  }
}

export async function fetchForecast(p: Place): Promise<Forecast> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${p.lat}&longitude=${p.lon}` +
    '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,snowfall_sum' +
    '&hourly=temperature_2m,weather_code,precipitation,precipitation_probability,wind_gusts_10m,relative_humidity_2m,is_day' +
    '&timezone=auto&forecast_days=7'
  const r = await fetch(url)
  if (!r.ok) throw new Error('weather ' + r.status)
  const j = await r.json()
  const d = j.daily
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
  const h = j.hourly
  const hours: HourWeather[] = ((h?.time ?? []) as string[]).map((time, i) => ({
    time,
    temp: h.temperature_2m[i],
    code: h.weather_code[i] ?? 0,
    rain: h.precipitation?.[i] ?? 0,
    rainChance: h.precipitation_probability?.[i] ?? null,
    gusts: h.wind_gusts_10m?.[i] ?? 0,
    humidity: h.relative_humidity_2m?.[i] ?? null,
    isDay: (h.is_day?.[i] ?? 1) === 1,
  }))
  const f: Forecast = {
    fetchedAt: Date.now(),
    utcOffset: typeof j.utc_offset_seconds === 'number' ? j.utc_offset_seconds : undefined,
    lat: p.lat,
    lon: p.lon,
    now: {
      temp: j.current.temperature_2m,
      code: j.current.weather_code,
      wind: j.current.wind_speed_10m,
      humidity: j.current.relative_humidity_2m ?? null,
      time: j.current.time,
      isDay: (j.current.is_day ?? 1) === 1,
    },
    days,
    hours,
  }
  writeCache(f)
  return f
}

/** The forecast for the saved place: shown from the cache straight away, refreshed when older than an hour. */
export function useForecast(place: Place | null | undefined) {
  const key = place ? placeKey(place) : ''
  type S = { key: string; data: Forecast | null; loading: boolean; error: boolean }
  const [state, setState] = useState<S>(() => ({ key, data: place ? readCachedForecast(place) : null, loading: false, error: false }))

  useEffect(() => {
    if (!place) {
      setState({ key, data: null, loading: false, error: false })
      return
    }
    const cached = readCachedForecast(place)
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
      setState({ key, data: cached, loading: false, error: false })
      return
    }
    let alive = true
    setState({ key, data: cached, loading: true, error: false })
    fetchForecast(place)
      .then((data) => alive && setState({ key, data, loading: false, error: false }))
      .catch(() => alive && setState({ key, data: cached, loading: false, error: true }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Right after switching places, never show the previous place's forecast.
  if (state.key !== key) return { data: place ? readCachedForecast(place) : null, loading: !!place, error: false }
  return state
}

/** WMO weather code → icon and English label (translated through i18n). */
export function weatherLook(code: number, isDay = true): { icon: string; label: string } {
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', label: 'Clear' }
  if (code <= 2) return { icon: isDay ? '🌤️' : '☁️', label: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', label: 'Cloudy' }
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', label: 'Rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: '🌨️', label: 'Snow' }
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' }
  return { icon: '🌡️', label: 'Weather' }
}

export interface PlaceResult extends Place {
  /** Tuman and viloyat, e.g. "Baliqchi tumani, Andijon viloyati". */
  region: string
  country: string
  /** Town (city, district centre) or a village. */
  kind: 'capital' | 'city' | 'town' | 'village'
  population: number | null
}

type GeoRow = {
  name: string
  latitude: number
  longitude: number
  feature_code?: string
  population?: number
  admin1?: string
  admin2?: string
  country?: string
}

function placeKind(r: GeoRow): PlaceResult['kind'] {
  const f = r.feature_code ?? ''
  const pop = r.population ?? 0
  if (f === 'PPLC' || f === 'PPLA') return 'capital'
  if (f === 'PPLA2' || pop >= 20000) return 'city'
  if (f === 'PPLA3' || f === 'PPLA4' || pop >= 3000) return 'town'
  return 'village'
}

const KIND_ORDER = { capital: 0, city: 1, town: 2, village: 3 }

/**
 * Search towns and villages by name (Open-Meteo geocoding, built on the GeoNames database).
 * GeoNames includes small villages, and many share a name, so each result carries its district,
 * whether it is a town or a village, and towns come first.
 */
export async function searchPlaces(q: string, lang: Lang): Promise<PlaceResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=30&format=json&language=${lang}`
  const r = await fetch(url)
  if (!r.ok) throw new Error('geocode ' + r.status)
  const j = await r.json()
  const rows = (j.results ?? []) as GeoRow[]
  const out: PlaceResult[] = []
  for (const x of rows) {
    const p: PlaceResult = {
      // "Baliqchi, Chinobod": the district (or region) in front, so places with the same name differ
      name: joinArea(x.admin2 || x.admin1, x.name),
      lat: Math.round(x.latitude * 10000) / 10000,
      lon: Math.round(x.longitude * 10000) / 10000,
      region: [x.admin2, x.admin1].filter(Boolean).join(', '),
      country: x.country ?? '',
      kind: placeKind(x),
      population: x.population ?? null,
    }
    // the same spot listed twice: keep one
    if (!out.some((o) => samePlace(o, p))) out.push(p)
  }
  out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (b.population ?? 0) - (a.population ?? 0))
  return out.slice(0, 12)
}

/** Link to the spot on OpenStreetMap, to check it is the right place. */
export function mapLink(p: { lat: number; lon: number }) {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=13/${p.lat}/${p.lon}`
}

/**
 * Town name for a GPS point (e.g. "Kunshan"), from BigDataCloud's free client-side lookup (no key).
 * Returns null if it can't be found; the caller keeps a default name then.
 */
/** "Baliqchi tumani" → "Baliqchi", "Andijon viloyati" → "Andijon", "Suzhou Shi" → "Suzhou". */
export function shortArea(name: string | undefined | null): string {
  if (!name) return ''
  return name
    .replace(/\s+(tumani|viloyati|shahri|shahar|district|region|province|city|shi|qu|xian|sheng|район|область|город|туман|вилояти)$/i, '')
    .replace(/^(город|г\.)\s+/i, '')
    .trim()
}

/** "Suzhou, Kunshan": the wider area first, then the place, without repeating a name. */
export function joinArea(parent: string | undefined | null, name: string): string {
  const a = shortArea(parent)
  const n = name.trim()
  if (!a || a.toLowerCase() === n.toLowerCase() || n.toLowerCase().startsWith(a.toLowerCase())) return n
  return `${a}, ${n}`
}

export async function placeName(lat: number, lon: number, lang: Lang): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`
    const r = await fetch(url)
    if (!r.ok) return null
    const j = (await r.json()) as {
      city?: string
      locality?: string
      principalSubdivision?: string
      localityInfo?: { administrative?: { name?: string; adminLevel?: number }[] }
    }
    // Two levels, wider first: "Suzhou, Kunshan" (city, county-level city), "Baliqchi, Chinobod" (tuman, village).
    const admin = (j.localityInfo?.administrative ?? [])
      .filter((a) => a.name && a.adminLevel && a.adminLevel >= 4)
      .sort((a, b) => (a.adminLevel ?? 0) - (b.adminLevel ?? 0))
    const mid = admin.filter((a) => (a.adminLevel ?? 0) >= 5 && (a.adminLevel ?? 0) <= 6)
    const region = admin.find((a) => a.adminLevel === 4)?.name
    let name: string
    if (mid.length >= 2) name = joinArea(mid[0].name, shortArea(mid[mid.length - 1].name))
    else if (mid.length === 1) {
      const local = (j.city || j.locality || '').trim()
      const area = shortArea(mid[0].name)
      name = local && shortArea(local).toLowerCase() !== area.toLowerCase() ? joinArea(area, local) : joinArea(region, area)
    } else name = joinArea(region || j.principalSubdivision, (j.city || j.locality || '').trim())
    name = name.trim()
    return name || null
  } catch {
    return null
  }
}

/** Default names given before the town could be looked up. */
export const DEFAULT_PLACE_NAMES = ['My farm', 'Моё хозяйство', 'Mening fermam']

/** Ask the phone for its location (the browser shows its own permission question). */
export function locateDevice(): Promise<{ lat: number; lon: number; accuracy: number | null }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'))
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          // 5 decimals ≈ 1 m, finer than any phone reading
          lat: Math.round(p.coords.latitude * 100000) / 100000,
          lon: Math.round(p.coords.longitude * 100000) / 100000,
          accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
        }),
      (e) => reject(e),
      // Precise mode: uses the phone's GPS (outdoors usually within 5–20 m); a fresh reading, not a saved one.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  })
}

/** Two places closer than about 1 km count as the same place. */
export function samePlace(a: Place | null | undefined, b: Place | null | undefined) {
  if (!a || !b) return false
  return Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01
}

/** Where a crop grows: its own place, or the farm's main place. */
export function cropPlace(db: DB, crop: SeasonCrop): Place | null {
  return crop.place ?? db.settings.place ?? null
}

/** Every place of the farm, main place first, without repeats. */
export function farmPlaces(db: DB): Place[] {
  const out: Place[] = []
  const add = (p: Place | null | undefined) => {
    if (p && !out.some((x) => samePlace(x, p))) out.push(p)
  }
  add(db.settings.place)
  for (const c of db.crops) add(c.place)
  return out
}

/**
 * The same spot on weather.com (The Weather Channel), to compare forecasts.
 * Their data can't be shown inside the app without a paid contract, so we link to it.
 */
export function weatherComLink(p: { lat: number; lon: number }, page: 'today' | 'hourbyhour' | 'tenday', lang: Lang) {
  const locale = lang === 'en' ? '' : '/ru-RU' // weather.com has no Uzbek; Russian is closest
  return `https://weather.com${locale}/weather/${page}/l/${p.lat.toFixed(4)},${p.lon.toFixed(4)}`
}

/** Days since planting: the planting day is day 1. Negative when the date is still ahead. */
export function dayOfCrop(plantedAt: string, today = new Date()): number {
  const [y, m, d] = plantedAt.split('-').map(Number)
  const start = Date.UTC(y, m - 1, d)
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((now - start) / 86400000)
  return diff >= 0 ? diff + 1 : diff
}
