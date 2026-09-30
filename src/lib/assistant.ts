import { useSyncExternalStore } from 'react'
import type { DB, SeasonCrop } from './store'
import { cropName } from './crops'
import { cropPlace, dayOfCrop, readCachedForecast } from './weather'
import { evaluateAlerts, alertText } from './alertRules'
import { translate } from './i18n'
import { todayISO } from './format'

/**
 * The AI assistant runs through a small helper on the owner's own computer, which uses the owner's
 * Claude Code login. This device only keeps the helper's address and secret key — in its own storage,
 * never in the farm data, so other family members' phones don't get it.
 */
export interface HelperLink {
  /** Helper address, e.g. https://xyz.trycloudflare.com or http://127.0.0.1:4555 */
  u: string
  /** Secret key */
  k: string
}

const LINK_KEY = 'agroledger:assistant'
const listeners = new Set<() => void>()

function readLink(): HelperLink | null {
  try {
    const l = JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null') as HelperLink | null
    return l && typeof l.u === 'string' && typeof l.k === 'string' ? l : null
  } catch {
    return null
  }
}
let current = readLink()

export function setHelperLink(link: HelperLink | null) {
  current = link
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link))
    else localStorage.removeItem(LINK_KEY)
  } catch {
    // storage blocked: kept for this visit only
  }
  listeners.forEach((f) => f())
}

export function useHelperLink() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => current,
  )
}

/** "#/connect/<code>" links printed by the helper hold {u, k} as base64url JSON. */
export function decodeConnectCode(code: string): HelperLink | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(b64 + '==='.slice((b64.length + 3) % 4))
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    )
    const v = JSON.parse(json) as HelperLink
    if (typeof v.u !== 'string' || typeof v.k !== 'string' || !/^https?:\/\//.test(v.u)) return null
    return { u: v.u.replace(/\/+$/, ''), k: v.k }
  } catch {
    return null
  }
}

async function call<T>(link: HelperLink, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(link.u + path, {
    ...init,
    headers: { Authorization: `Bearer ${link.k}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
  return j as T
}

export interface HelperHealth {
  ok: boolean
  claude: string | null
  model: string
  busy: boolean
  waiting: number
}

/**
 * After the helper restarts it gets a new address. It posts that address, encrypted with a key made
 * from the secret key, to a private-named topic on ntfy.sh; linked devices read it from there.
 */
async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
function fromB64url(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

export async function findNewAddress(link: HelperLink): Promise<string | null> {
  try {
    const topic = 'agl-' + hex(await sha256('agroledger-topic:' + link.k)).slice(0, 40)
    const r = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=24h`)
    if (!r.ok) return null
    const lines = (await r.text()).trim().split('\n').filter(Boolean)
    const key = await crypto.subtle.importKey('raw', await sha256('agroledger-url:' + link.k), 'AES-GCM', false, ['decrypt'])
    let best: { u: string; t: number } | null = null
    for (const line of lines) {
      try {
        const m = JSON.parse(line) as { event?: string; message?: string }
        if (m.event !== 'message' || !m.message) continue
        const raw = fromB64url(m.message)
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12))
        const v = JSON.parse(new TextDecoder().decode(plain)) as { u: string; t: number }
        if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(v.u) && (!best || v.t > best.t)) best = v
      } catch {
        // not ours or damaged: skip
      }
    }
    return best?.u ?? null
  } catch {
    return null
  }
}

/** Check the helper; if the saved address no longer answers, look up its new address and save it. */
export async function helperHealth(link: HelperLink): Promise<HelperHealth> {
  try {
    return await call<HelperHealth>(link, '/health')
  } catch (e) {
    if (/key/.test((e as Error).message)) throw e
    const u = await findNewAddress(link)
    if (!u || u === link.u) throw e
    const moved = { ...link, u }
    const h = await call<HelperHealth>(moved, '/health')
    setHelperLink(moved)
    return h
  }
}

export interface AskInput {
  question: string
  context: string
  lang: string
  images: { type: string; data: string }[]
  previous?: string
}

export interface JobState {
  status: 'waiting' | 'running' | 'done' | 'error'
  answer?: string
  error?: string
  costUsd?: number | null
  position?: number
}

/** Send one question, then check back every few seconds until the answer is ready. */
export async function askHelper(link: HelperLink, input: AskInput, onState: (s: JobState) => void, signal?: AbortSignal) {
  let { id } = { id: '' }
  try {
    ;({ id } = await call<{ id: string }>(link, '/ask', { method: 'POST', body: JSON.stringify(input) }))
  } catch (e) {
    // the helper may have restarted with a new address: find it and try once more
    if (/key/.test((e as Error).message)) throw e
    await helperHealth(link)
    link = current ?? link
    ;({ id } = await call<{ id: string }>(link, '/ask', { method: 'POST', body: JSON.stringify(input) }))
  }
  const started = Date.now()
  for (;;) {
    if (signal?.aborted) throw new Error('cancelled')
    await new Promise((r) => setTimeout(r, 2500))
    const s = await call<JobState>(link, `/job/${id}`)
    onState(s)
    if (s.status === 'done' || s.status === 'error') return s
    if (Date.now() - started > 8 * 60 * 1000) throw new Error('timeout')
  }
}

/** Shrink a photo to at most 1568 px on the long side (Claude's useful size) as JPEG, to keep uploads small. */
export async function shrinkPhoto(file: File): Promise<{ type: string; data: string; preview: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    return { type: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * A short summary of the crop for the assistant: what, where, how old, weather, recent work.
 * Written in English (the assistant answers in the app's language anyway). Kept short to save usage.
 */
export function cropContext(db: DB, crop: SeasonCrop): string {
  const lines: string[] = []
  const season = db.seasons.find((s) => s.id === crop.seasonId)
  lines.push(
    `Crop: ${cropName(crop.crop, 'en')}${crop.variety ? `, variety ${crop.variety}` : ''}${crop.areaHa ? `, ${crop.areaHa} ha` : ''}` +
      (season ? `, season ${season.startYear}` : ''),
  )
  lines.push('Grown in: greenhouse (film/plastic).')
  const place = cropPlace(db, crop)
  if (place) lines.push(`Place: ${place.name} (${place.lat.toFixed(4)}, ${place.lon.toFixed(4)})`)
  if (crop.plantedAt) {
    const d = dayOfCrop(crop.plantedAt)
    lines.push(`Seedlings planted: ${crop.plantedAt} (${d > 0 ? `day ${d}` : `in ${-d} days`})`)
  }
  lines.push(`Today: ${todayISO()}`)

  const f = place ? readCachedForecast(place) : null
  if (f) {
    const days = f.days
      .slice(0, 4)
      .map(
        (d) =>
          `${d.date}: ${Math.round(d.tMin)}–${Math.round(d.tMax)}°C, rain ${Math.round(d.rain * 10) / 10} mm, gusts ${Math.round(d.gusts)} km/h`,
      )
    lines.push('Weather (outside):', ...days.map((x) => '- ' + x))
    const hum = f.hours
      .slice(0, 24)
      .map((h) => h.humidity)
      .filter((x): x is number => x !== null)
    if (hum.length) lines.push(`- humidity next 24 h: ${Math.min(...hum)}–${Math.max(...hum)}%`)
    const alerts = evaluateAlerts(f)
    if (alerts.length)
      lines.push(
        'Weather alerts: ' + alerts.map((a) => `${a.date} ${alertText(a, (k, v) => translate('en', k, v)).split('. ')[0]}`).join('; '),
      )
  }

  // Recent work: the last 30 days of expenses (fertiliser, sprays, seeds…), newest first.
  const d30 = new Date(Date.now() - 30 * 86400000)
  const since = `${d30.getFullYear()}-${String(d30.getMonth() + 1).padStart(2, '0')}-${String(d30.getDate()).padStart(2, '0')}`
  const exp = db.expenses
    .filter((e) => e.cropId === crop.id && e.date >= since && !e.forWorkers)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15)
    .map((e) => `- ${e.date}: ${e.name}${e.quantity ? ` ${e.quantity}${e.unit ? ' ' + e.unit : ''}` : ''}${e.note ? ` (${e.note})` : ''}`)
  if (exp.length) lines.push('Recent purchases/work (last 30 days):', ...exp)

  const hv = db.harvests.filter((h) => h.cropId === crop.id && h.date >= since)
  const boxes = hv.reduce((a, h) => a + (h.boxes ?? 0), 0)
  if (boxes) lines.push(`Harvest last 30 days: ${boxes} boxes`)
  return lines.join('\n')
}
