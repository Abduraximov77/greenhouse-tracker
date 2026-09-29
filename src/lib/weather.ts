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
}

export interface Forecast {
  fetchedAt: number
  lat: number
  lon: number
  now: { temp: number; code: number; wind: number; humidity: number | null }
  days: DayWeather[]
}

export type WarningKind = 'frost' | 'cold' | 'heat' | 'wind' | 'rain' | 'storm' | 'snow'

export interface WeatherWarning {
  kind: WarningKind
  date: string
  /** Main value for the message (°C, km/h or mm). */
  value: number
  level: 'danger' | 'warn'
}

const CACHE_KEY = 'agroledger:weather2'
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

function readCache(p: Place): Forecast | null {
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
    '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max' +
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
  }))
  const f: Forecast = {
    fetchedAt: Date.now(),
    lat: p.lat,
    lon: p.lon,
    now: {
      temp: j.current.temperature_2m,
      code: j.current.weather_code,
      wind: j.current.wind_speed_10m,
      humidity: j.current.relative_humidity_2m ?? null,
    },
    days,
  }
  writeCache(f)
  return f
}

/** The forecast for the saved place: shown from the cache straight away, refreshed when older than an hour. */
export function useForecast(place: Place | null | undefined) {
  const key = place ? placeKey(place) : ''
  type S = { key: string; data: Forecast | null; loading: boolean; error: boolean }
  const [state, setState] = useState<S>(() => ({ key, data: place ? readCache(place) : null, loading: false, error: false }))

  useEffect(() => {
    if (!place) {
      setState({ key, data: null, loading: false, error: false })
      return
    }
    const cached = readCache(place)
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
  if (state.key !== key) return { data: place ? readCache(place) : null, loading: !!place, error: false }
  return state
}

/** Things worth warning a greenhouse farmer about, for the next few days. */
export function weatherWarnings(f: Forecast, days = 3): WeatherWarning[] {
  const out: WeatherWarning[] = []
  for (const d of f.days.slice(0, days)) {
    if (d.tMin <= 0) out.push({ kind: 'frost', date: d.date, value: d.tMin, level: 'danger' })
    else if (d.tMin <= 4) out.push({ kind: 'cold', date: d.date, value: d.tMin, level: 'warn' })
    if (d.tMax >= 38) out.push({ kind: 'heat', date: d.date, value: d.tMax, level: 'danger' })
    else if (d.tMax >= 35) out.push({ kind: 'heat', date: d.date, value: d.tMax, level: 'warn' })
    if (d.gusts >= 60) out.push({ kind: 'wind', date: d.date, value: d.gusts, level: 'danger' })
    else if (d.gusts >= 45) out.push({ kind: 'wind', date: d.date, value: d.gusts, level: 'warn' })
    if ([95, 96, 99].includes(d.code)) out.push({ kind: 'storm', date: d.date, value: d.rain, level: d.code === 95 ? 'warn' : 'danger' })
    else if ([71, 73, 75, 77, 85, 86].includes(d.code)) out.push({ kind: 'snow', date: d.date, value: d.rain, level: 'warn' })
    else if (d.rain >= 10) out.push({ kind: 'rain', date: d.date, value: d.rain, level: d.rain >= 25 ? 'danger' : 'warn' })
  }
  return out
}

/** WMO weather code → icon and English label (translated through i18n). */
export function weatherLook(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Clear' }
  if (code <= 2) return { icon: '🌤️', label: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', label: 'Cloudy' }
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', label: 'Rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: '🌨️', label: 'Snow' }
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' }
  return { icon: '🌡️', label: 'Weather' }
}

export interface PlaceResult extends Place {
  region: string
}

/** Search towns and villages by name (Open-Meteo geocoding). */
export async function searchPlaces(q: string, lang: Lang): Promise<PlaceResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&format=json&language=${lang}`
  const r = await fetch(url)
  if (!r.ok) throw new Error('geocode ' + r.status)
  const j = await r.json()
  return ((j.results ?? []) as { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[]).map((x) => ({
    name: x.name,
    lat: Math.round(x.latitude * 10000) / 10000,
    lon: Math.round(x.longitude * 10000) / 10000,
    region: [x.admin1, x.country].filter(Boolean).join(', '),
  }))
}

/**
 * Town name for a GPS point (e.g. "Kunshan"), from BigDataCloud's free client-side lookup (no key).
 * Returns null if it can't be found; the caller keeps a default name then.
 */
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
    // Prefer the town/district level (e.g. Kunshan, not the bigger Suzhou; a tuman, not the whole viloyat).
    const admin = (j.localityInfo?.administrative ?? []).filter((a) => a.name && a.adminLevel && a.adminLevel >= 5 && a.adminLevel <= 6)
    admin.sort((a, b) => (b.adminLevel ?? 0) - (a.adminLevel ?? 0))
    const name = (admin[0]?.name || j.city || j.locality || j.principalSubdivision || '').trim()
    return name || null
  } catch {
    return null
  }
}

/** Default names given before the town could be looked up. */
export const DEFAULT_PLACE_NAMES = ['My farm', 'Моё хозяйство', 'Mening fermam']

/** Ask the phone for its location (the browser shows its own permission question). */
export function locateDevice(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 10000) / 10000, lon: Math.round(p.coords.longitude * 10000) / 10000 }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    )
  })
}

/** Days since planting: the planting day is day 1. Negative when the date is still ahead. */
export function dayOfCrop(plantedAt: string, today = new Date()): number {
  const [y, m, d] = plantedAt.split('-').map(Number)
  const start = Date.UTC(y, m - 1, d)
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((now - start) / 86400000)
  return diff >= 0 ? diff + 1 : diff
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
