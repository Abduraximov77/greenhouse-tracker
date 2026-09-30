/**
 * The AI assistant ("AI yordamchi").
 *
 * The app does not call Claude itself: it sends the crop's records to the AI helper running on this
 * computer (public/ai-helper.mjs → `node ai-helper.mjs`), which asks the Claude Code CLI with the
 * user's own Claude login. Plans and chats are kept in this browser, like the rest of the data.
 */
import { useSyncExternalStore } from 'react'
import { cropDays, dayPay, DEFAULT_AI, type AiSettings, type DB, type Lang, type SeasonCrop } from './store'
import { cropName } from './crops'
import { cropPlace, dayOfCrop, type Forecast } from './weather'
import { alertText, evaluateAlerts } from './alertRules'
import { translate } from './i18n'
import { todayISO } from './format'
import { cropTotals } from '../pages/cropTotals'

// ---------- what the helper sends back ----------

export interface PlanDose {
  product: string
  perHa: number
  total: number
  unit: string
}

export interface PlanJob {
  icon: string
  title: string
  detail: string
  why: string
  doses?: PlanDose[]
}

export interface Plan {
  stage: string
  summary: string
  jobs: PlanJob[]
  warnings: string[]
  sources: string[]
  missing?: string
}

export interface SavedPlan {
  date: string
  lang: Lang
  madeAt: string
  plan: Plan
  /** Indexes of jobs ticked as done. */
  done: number[]
}

export interface ChatMsg {
  id: string
  role: 'user' | 'ai'
  text: string
  /** Small copy of an attached photo (shown in the chat). */
  photo?: string
  at: string
  error?: boolean
}

interface CropAi {
  plans: Record<string, SavedPlan> // by date
  chat: ChatMsg[]
}

// ---------- local store (separate from the records, so AI answers never mix with the family's data) ----------

const KEY = 'agroledger:ai1'
type AiData = Record<string, CropAi>

function readAll(): AiData {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? 'null') as AiData | null) ?? {}
  } catch {
    return {}
  }
}

let data: AiData = readAll()
const listeners = new Set<() => void>()

function save(next: AiData) {
  data = next
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // storage full: drop photos from old messages and try once more
    for (const c of Object.values(data)) for (const m of c.chat.slice(0, -6)) delete m.photo
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      // keep in memory for this visit
    }
  }
  listeners.forEach((l) => l())
}

const EMPTY: CropAi = { plans: {}, chat: [] }

export function useCropAi(cropId: string): CropAi {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => data[cropId] ?? EMPTY,
  )
}

function update(cropId: string, f: (c: CropAi) => CropAi) {
  save({ ...data, [cropId]: f(data[cropId] ?? EMPTY) })
}

export function savePlan(cropId: string, p: SavedPlan) {
  // keep the last 14 days of plans
  update(cropId, (c) => ({ ...c, plans: Object.fromEntries(Object.entries({ ...c.plans, [p.date]: p }).sort().slice(-14)) }))
}

export function toggleJob(cropId: string, date: string, i: number) {
  update(cropId, (c) => {
    const p = c.plans[date]
    if (!p) return c
    const done = p.done.includes(i) ? p.done.filter((x) => x !== i) : [...p.done, i]
    return { ...c, plans: { ...c.plans, [date]: { ...p, done } } }
  })
}

/** Add a job to today's plan by hand (from a chat answer). */
export function addJobToday(cropId: string, job: PlanJob, lang: Lang) {
  const date = todayISO()
  update(cropId, (c) => {
    const p: SavedPlan = c.plans[date] ?? {
      date,
      lang,
      madeAt: new Date().toISOString(),
      done: [],
      plan: { stage: '', summary: '', jobs: [], warnings: [], sources: [] },
    }
    return { ...c, plans: { ...c.plans, [date]: { ...p, plan: { ...p.plan, jobs: [...p.plan.jobs, job] } } } }
  })
}

export function addChat(cropId: string, m: ChatMsg) {
  update(cropId, (c) => {
    const chat = [...c.chat, m].slice(-60)
    // photos take room: keep them only on the last 10 messages
    return { ...c, chat: chat.map((x, i) => (i < chat.length - 10 && x.photo ? { ...x, photo: undefined } : x)) }
  })
}

export function clearChat(cropId: string) {
  update(cropId, (c) => ({ ...c, chat: [] }))
}

// ---------- talking to the helper ----------

export function aiSettings(db: DB): AiSettings {
  return { ...DEFAULT_AI, ...db.settings.ai }
}

export class HelperError extends Error {
  kind: 'offline' | 'code' | 'busy' | 'claude'
  constructor(message: string, kind: HelperError['kind']) {
    super(message)
    this.kind = kind
  }
}

async function call(s: AiSettings, path: string, body?: unknown, timeoutMs = 5 * 60 * 1000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(s.url.replace(/\/+$/, '') + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-agro-code': s.code.trim().toUpperCase(), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch {
    throw new HelperError('offline', 'offline')
  } finally {
    clearTimeout(timer)
  }
  const json = await res.json().catch(() => ({}))
  if (res.status === 401) throw new HelperError('code', 'code')
  if (res.status === 429) throw new HelperError('busy', 'busy')
  if (!res.ok) throw new HelperError(String(json.error ?? `HTTP ${res.status}`), 'claude')
  return json
}

export interface HelperStatus {
  ok: boolean
  paired: boolean
  claude?: string | null
}

export async function helperStatus(s: AiSettings): Promise<HelperStatus> {
  return (await call(s, '/status', undefined, 4000)) as HelperStatus
}

export async function askPlan(s: AiSettings, lang: Lang, context: object): Promise<Plan> {
  const r = await call(s, '/ask', { kind: 'plan', lang, webSearch: s.webSearch, context })
  const p = r.answer as Plan | null
  if (!p || !Array.isArray(p.jobs)) throw new HelperError('Claude gave no plan.', 'claude')
  return { ...p, warnings: p.warnings ?? [], sources: p.sources ?? [] }
}

export async function askChat(
  s: AiSettings,
  lang: Lang,
  context: object,
  question: string,
  history: ChatMsg[],
  photo?: string,
): Promise<string> {
  const messages = history.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text }))
  const r = await call(s, '/ask', { kind: 'chat', lang, webSearch: s.webSearch, context, question, messages, photo })
  return String(r.answer ?? '')
}

// ---------- the farm data Claude gets ----------

/** Every detail entered for this crop, in plain English keys, plus the weather. */
export function buildContext(db: DB, crop: SeasonCrop, forecast: Forecast | null) {
  const place = cropPlace(db, crop)
  const season = db.seasons.find((s) => s.id === crop.seasonId)
  const mine = <T extends { cropId: string }>(list: T[]) => list.filter((r) => r.cropId === crop.id)
  const tt = cropTotals(db, crop.id)
  const days = cropDays(db, crop.id)
  const worker = (id: string) => db.workers.find((w) => w.id === id)
  const en = (key: string, vars?: Record<string, string | number>) => translate('en', key, vars)

  // boxes per day: packed by workers + other harvest
  const perDay = new Map<string, number>()
  for (const d of days) if (d.status === 'on' && d.boxes) perDay.set(d.date, (perDay.get(d.date) ?? 0) + d.boxes)
  for (const h of mine(db.harvests)) perDay.set(h.date, (perDay.get(h.date) ?? 0) + h.boxes)

  // worker days per date: how many men and women worked
  const workDays = new Map<string, { men: number; women: number; off: number; boxes: number; pay: number }>()
  for (const d of days) {
    const x = workDays.get(d.date) ?? { men: 0, women: 0, off: 0, boxes: 0, pay: 0 }
    if (d.status === 'off') x.off++
    else if (worker(d.workerId)?.gender === 'female') x.women++
    else x.men++
    x.boxes += d.boxes ?? 0
    x.pay += dayPay(d)
    workDays.set(d.date, x)
  }

  const strip = <T extends object>(r: T) =>
    Object.fromEntries(
      Object.entries(r).filter(
        ([k, v]) => !['id', 'cropId', 'seasonId', 'createdAt', 'updatedAt', 'shipmentId', 'returnOf'].includes(k) && v !== null && v !== '' && v !== undefined,
      ),
    )
  const byDate = <T extends { date: string }>(list: T[]) => [...list].sort((a, b) => a.date.localeCompare(b.date))

  return {
    today: todayISO(),
    crop: {
      name: cropName(crop.crop, 'en'),
      variety: crop.variety || null,
      areaHa: crop.areaHa,
      plantedAt: crop.plantedAt ?? null,
      dayNumber: crop.plantedAt ? dayOfCrop(crop.plantedAt) : null,
      season: season?.startYear ?? null,
      place: place ? { name: place.name, lat: place.lat, lon: place.lon } : null,
    },
    otherCropsOnFarm: db.crops
      .filter((c) => c.id !== crop.id && c.seasonId === crop.seasonId)
      .map((c) => ({ name: cropName(c.crop, 'en'), variety: c.variety || null, areaHa: c.areaHa, plantedAt: c.plantedAt ?? null })),
    weather: forecast
      ? {
          now: forecast.now,
          next7Days: forecast.days.map((d) => ({ date: d.date, tMaxC: d.tMax, tMinC: d.tMin, rainMm: d.rain, rainChancePct: d.rainChance, gustsKmh: d.gusts })),
          alertsFromRules: evaluateAlerts(forecast).map((a) => `${a.date} [${a.level}] ${alertText(a, en)}`),
        }
      : null,
    totals: {
      currency: db.settings.currency,
      boxesHarvested: tt.boxesHarvested,
      boxesExported: tt.boxesExported,
      boxesInStock: tt.boxesInStock,
      trucks: tt.trucks,
      salesTotal: tt.salesTotal,
      income: tt.income,
      allCosts: tt.totalCost,
      workerPay: tt.workerPay,
      expenses: tt.expensesCost,
      delivery: tt.deliveryCost,
      profit: tt.profit,
      stillToPay: tt.owed,
    },
    expenses: byDate(mine(db.expenses)).map(strip),
    harvestBoxesPerDay: [...perDay.entries()].sort().map(([date, boxes]) => ({ date, boxes })),
    harvestNotes: byDate(mine(db.harvests)).filter((h) => h.note || h.totalKg).map(strip),
    workerDays: [...workDays.entries()].sort().map(([date, x]) => ({ date, ...x })),
    workers: {
      men: db.workers.filter((w) => w.gender !== 'female').length,
      women: db.workers.filter((w) => w.gender === 'female').length,
    },
    trucks: byDate(mine(db.shipments)).map((s) => {
      const { truckNumber: _n, driverName: _d, driverPhone: _p, ...rest } = s
      return strip(rest)
    }),
    sales: byDate(mine(db.sales)).map(strip),
    income: byDate(mine(db.incomes)).map(strip),
    giveAndTake: byDate(mine(db.deals)).map(strip),
  }
}
