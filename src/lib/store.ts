/**
 * All app data lives here. For now it is saved in this browser (localStorage).
 * Every record gets createdAt / updatedAt automatically.
 * Later this module is the only place that has to change to move to a cloud database.
 */
import { useSyncExternalStore } from 'react'

export type ID = string

export interface Meta {
  id: ID
  createdAt: string // ISO timestamp, set automatically
  updatedAt: string
}

export interface Season extends Meta {
  startYear: number // 2026 → "2026–2027"
}

export interface SeasonCrop extends Meta {
  seasonId: ID
  crop: string
  variety: string
  areaHa: number | null // growing area in hectares, used for per-hectare calculations
}

export interface Planting extends Meta {
  cropId: ID
  arrivedOn: string // date seedlings arrived (YYYY-MM-DD)
  plantedOn: string // date planted (may be empty until planted)
  supplier: string
  quantity: number
  unitPrice: number
  totalCost: number
  currency: string // currency of the prices above
  note: string
}

export type AmountUnit = 'kg' | 'L'

export interface Nutrition extends Meta {
  cropId: ID
  date: string
  product: string
  ratePerHa: number
  unit: AmountUnit
  areaHa: number
  totalAmount: number // ratePerHa × areaHa
  pricePerUnit: number | null
  totalCost: number | null
  currency: string
  note: string
}

export interface Harvest extends Meta {
  cropId: ID
  date: string
  boxes: number
  kgPerBox: number | null
  totalKg: number | null
  note: string
}

export interface Shipment extends Meta {
  cropId: ID
  date: string
  truckNumber: string
  driverName: string
  driverPhone: string
  boxes: number
  deliveryPrice: number
  currency: string
  destination: string
  note: string
}

/** Workers are shared by every season and crop: add once, use everywhere. */
export interface Worker extends Meta {
  name: string
  phone: string
  dailySalary: number // 0 if paid only per box
  payPerBox: number // default value for each box prepared
  currency: string // currency of salary and pay per box
}

export type DayStatus = 'on' | 'off'

/**
 * One worker's day on one crop. Salary and pay per box are stored on the day,
 * so changing a worker's rates later doesn't rewrite past days.
 * Boxes prepared here also count as harvest for that crop and day.
 */
export interface Attendance {
  seasonId: ID
  cropId: ID
  workerId: ID
  date: string
  status: DayStatus
  salary: number
  boxes: number | null
  payPerBox: number | null
  currency: string
  updatedAt: string
}

export type Lang = 'en' | 'ru' | 'uz'

export interface Settings {
  currency: string // totals are shown in this currency
  lang: Lang
  /** Exchange rates: how many units of each currency equal 1 USD (USD = 1). */
  rates: Record<string, number>
  ratesUpdatedAt: string | null
  ratesSource: 'manual' | 'online' | null
}

export interface DB {
  version: 4
  seasons: Season[]
  crops: SeasonCrop[]
  plantings: Planting[]
  nutrition: Nutrition[]
  harvests: Harvest[]
  shipments: Shipment[]
  workers: Worker[]
  attendance: Record<string, Attendance> // key: `${cropId}|${workerId}|${date}`
  settings: Settings
}

type Collections = {
  seasons: Season
  crops: SeasonCrop
  plantings: Planting
  nutrition: Nutrition
  harvests: Harvest
  shipments: Shipment
  workers: Worker
}
export type CollectionName = keyof Collections

const STORAGE_KEY = 'agroledger:v1'

function nowIso() {
  return new Date().toISOString()
}

export function newId(): ID {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function seed(): DB {
  const t = nowIso()
  const year = new Date().getFullYear()
  return {
    version: 4,
    seasons: [year, year + 1].map((y) => ({ id: newId(), startYear: y, createdAt: t, updatedAt: t })),
    crops: [],
    plantings: [],
    nutrition: [],
    harvests: [],
    shipments: [],
    workers: [],
    attendance: {},
    settings: { currency: 'USD', lang: 'en', rates: { USD: 1 }, ratesUpdatedAt: null, ratesSource: null },
  }
}

function load(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      let d = JSON.parse(raw)
      if (d && d.version === 1) d = migrateV1(d)
      if (d && d.version === 2) d = migrateV2(d)
      if (d && d.version === 3) d = migrateV3(d)
      if (d && d.version === 4) {
        const base = seed()
        return { ...base, ...d, settings: { ...base.settings, ...d.settings } } as DB
      }
    }
  } catch {
    // storage unavailable or corrupted: start fresh (in memory)
  }
  return seed()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** v1 had workers inside one season; v2 shares workers across seasons. */
function migrateV1(old: any): any {
  const seasonOf: Record<string, string> = {}
  const workers = (old.workers ?? []).map((w: any) => {
    seasonOf[w.id] = w.seasonId
    return {
      id: w.id,
      name: w.name,
      phone: w.phone ?? '',
      dailySalary: w.dailySalary ?? 0,
      payPerBox: 0,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }
  })
  const attendance: Record<string, any> = {}
  for (const a of Object.values(old.attendance ?? {}) as any[]) {
    const seasonId = seasonOf[a.workerId]
    if (!seasonId) continue
    attendance[`${seasonId}|${a.workerId}|${a.date}`] = {
      seasonId,
      workerId: a.workerId,
      date: a.date,
      status: a.status,
      salary: a.salary ?? 0,
      boxes: null,
      payPerBox: null,
      updatedAt: a.updatedAt,
    }
  }
  return { ...old, version: 2, workers, attendance }
}

/** v2 kept worker days per season; v3 keeps them per crop (first crop of that season). */
function migrateV2(old: any): any {
  const firstCrop: Record<string, string> = {}
  for (const c of [...(old.crops ?? [])].sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt))) {
    if (!firstCrop[c.seasonId]) firstCrop[c.seasonId] = c.id
  }
  const attendance: Record<string, Attendance> = {}
  for (const a of Object.values(old.attendance ?? {}) as any[]) {
    const cropId = firstCrop[a.seasonId]
    if (!cropId) continue // no crop in that season to attach the day to
    attendance[attendanceKey(cropId, a.workerId, a.date)] = { ...a, cropId }
  }
  return { ...old, version: 3, attendance }
}
/** v4 stores a currency on every amount. Old amounts were in the currency chosen at the time. */
function migrateV3(old: any): any {
  const cur = old.settings?.currency ?? 'USD'
  const add = (list: any[] = []) => list.map((r) => ({ currency: cur, ...r }))
  return {
    ...old,
    version: 4,
    plantings: add(old.plantings),
    nutrition: add(old.nutrition),
    shipments: add(old.shipments),
    workers: add(old.workers),
    attendance: Object.fromEntries(Object.entries(old.attendance ?? {}).map(([k, a]: [string, any]) => [k, { currency: cur, ...a }])),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let db: DB = load()
const listeners = new Set<() => void>()

function commit(next: DB) {
  db = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // ignore: data stays in memory for this visit
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, () => db)
}

/** Current settings, for code outside React rendering. */
export function currentSettings(): Settings {
  return db.settings
}

/** Current language, for code outside React components (formatting). */
export function currentLang(): Lang {
  return db.settings.lang
}

// ---------- generic record actions ----------

export function addRecord<K extends CollectionName>(
  name: K,
  data: Omit<Collections[K], keyof Meta>,
): Collections[K] {
  const t = nowIso()
  const rec = { ...data, id: newId(), createdAt: t, updatedAt: t } as Collections[K]
  commit({ ...db, [name]: [...(db[name] as Collections[K][]), rec] })
  return rec
}

export function updateRecord<K extends CollectionName>(
  name: K,
  id: ID,
  patch: Partial<Omit<Collections[K], keyof Meta>>,
) {
  const list = (db[name] as Collections[K][]).map((r) =>
    r.id === id ? { ...r, ...patch, updatedAt: nowIso() } : r,
  )
  commit({ ...db, [name]: list })
}

function dropAttendance(d: DB, drop: (a: Attendance) => boolean): DB {
  return { ...d, attendance: Object.fromEntries(Object.entries(d.attendance).filter(([, a]) => !drop(a))) }
}

export function removeRecord(name: CollectionName, id: ID) {
  let next: DB = { ...db, [name]: (db[name] as Meta[]).filter((r) => r.id !== id) }
  // remove everything that belongs to the deleted record (workers themselves always stay)
  if (name === 'seasons') {
    const cropIds = new Set(db.crops.filter((c) => c.seasonId === id).map((c) => c.id))
    next = dropCropChildren({ ...next, crops: next.crops.filter((c) => !cropIds.has(c.id)) }, cropIds)
  }
  if (name === 'crops') next = dropCropChildren(next, new Set([id]))
  if (name === 'workers') next = dropAttendance(next, (a) => a.workerId === id)
  commit(next)
}

function dropCropChildren(d: DB, cropIds: Set<ID>): DB {
  const keep = <T extends { cropId: ID }>(list: T[]) => list.filter((r) => !cropIds.has(r.cropId))
  return dropAttendance(
    {
      ...d,
      plantings: keep(d.plantings),
      nutrition: keep(d.nutrition),
      harvests: keep(d.harvests),
      shipments: keep(d.shipments),
    },
    (a) => cropIds.has(a.cropId),
  )
}

// ---------- worker days ----------

export function attendanceKey(cropId: ID, workerId: ID, date: string) {
  return `${cropId}|${workerId}|${date}`
}

/**
 * Update a worker's day on a crop. Missing fields keep their current value; new days
 * take the worker's current salary and pay per box. Passing status null clears the day.
 */
export function setWorkerDay(
  crop: SeasonCrop,
  worker: Worker,
  date: string,
  patch: { status?: DayStatus | null; boxes?: number | null; payPerBox?: number | null },
) {
  const key = attendanceKey(crop.id, worker.id, date)
  const attendance = { ...db.attendance }
  const cur = attendance[key]
  if (patch.status === null) {
    delete attendance[key]
  } else {
    const base: Attendance = cur ?? {
      seasonId: crop.seasonId,
      cropId: crop.id,
      workerId: worker.id,
      date,
      status: 'on',
      salary: worker.dailySalary,
      boxes: null,
      payPerBox: worker.payPerBox || null,
      currency: worker.currency,
      updatedAt: nowIso(),
    }
    const next: Attendance = { ...base, ...patch, updatedAt: nowIso() } as Attendance
    // A day off has no boxes.
    if (next.status === 'off') next.boxes = null
    attendance[key] = next
  }
  // Remember the pay per box on the worker for next time.
  let workers = db.workers
  if (patch.payPerBox != null && patch.payPerBox !== worker.payPerBox) {
    workers = workers.map((w) => (w.id === worker.id ? { ...w, payPerBox: patch.payPerBox!, updatedAt: nowIso() } : w))
  }
  commit({ ...db, attendance, workers })
}

/** Money earned on one day: daily salary (if worked) + boxes × pay per box. */
export function dayPay(a: Attendance) {
  if (a.status !== 'on') return 0
  return a.salary + (a.boxes ?? 0) * (a.payPerBox ?? 0)
}

/** Worker days for one crop. */
export function cropDays(d: DB, cropId: ID): Attendance[] {
  return Object.values(d.attendance).filter((a) => a.cropId === cropId)
}

// ---------- settings ----------

export function setCurrency(currency: string) {
  commit({ ...db, settings: { ...db.settings, currency } })
}

export function setLang(lang: Lang) {
  commit({ ...db, settings: { ...db.settings, lang } })
}

/** Save exchange rates (units per 1 USD). */
export function setRates(rates: Record<string, number>, source: 'manual' | 'online') {
  commit({
    ...db,
    settings: { ...db.settings, rates: { ...db.settings.rates, ...rates, USD: 1 }, ratesUpdatedAt: nowIso(), ratesSource: source },
  })
}

// ---------- helpers ----------

export function seasonLabel(s: Pick<Season, 'startYear'>) {
  return `${s.startYear}–${s.startYear + 1}`
}

export function byDateDesc<T extends { createdAt: string }>(getDate: (r: T) => string) {
  return (a: T, b: T) => getDate(b).localeCompare(getDate(a)) || b.createdAt.localeCompare(a.createdAt)
}

/** Group records by a date field, newest day first. */
export function groupByDate<T>(list: T[], getDate: (r: T) => string): [string, T[]][] {
  const days = new Map<string, T[]>()
  for (const r of list) days.set(getDate(r), [...(days.get(getDate(r)) ?? []), r])
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}
