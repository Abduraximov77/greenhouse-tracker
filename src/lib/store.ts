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
  destination: string
  note: string
}

/** Workers are shared by all seasons: add once, use every season. */
export interface Worker extends Meta {
  name: string
  phone: string
  dailySalary: number // 0 if paid only per box
  payPerBox: number // default value for each box prepared
}

export type DayStatus = 'on' | 'off'

/**
 * One worker's day in one season. Salary and pay per box are stored on the day,
 * so changing a worker's rates later doesn't rewrite past days.
 */
export interface Attendance {
  seasonId: ID
  workerId: ID
  date: string
  status: DayStatus
  salary: number
  boxes: number | null
  payPerBox: number | null
  updatedAt: string
}

export interface Settings {
  currency: string
}

export interface DB {
  version: 2
  seasons: Season[]
  crops: SeasonCrop[]
  plantings: Planting[]
  nutrition: Nutrition[]
  harvests: Harvest[]
  shipments: Shipment[]
  workers: Worker[]
  attendance: Record<string, Attendance> // key: `${seasonId}|${workerId}|${date}`
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
    version: 2,
    seasons: [year, year + 1].map((y) => ({ id: newId(), startYear: y, createdAt: t, updatedAt: t })),
    crops: [],
    plantings: [],
    nutrition: [],
    harvests: [],
    shipments: [],
    workers: [],
    attendance: {},
    settings: { currency: 'USD' },
  }
}

function load(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version === 1) return migrateV1(parsed)
      if (parsed && parsed.version === 2) return { ...seed(), ...parsed } as DB
    }
  } catch {
    // storage unavailable or corrupted: start fresh (in memory)
  }
  return seed()
}

/** v1 had workers inside one season; v2 shares workers across seasons. */
function migrateV1(old: any): DB {
  const seasonOf: Record<string, string> = {}
  const workers: Worker[] = (old.workers ?? []).map((w: any) => {
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
  const attendance: Record<string, Attendance> = {}
  for (const a of Object.values(old.attendance ?? {}) as any[]) {
    const seasonId = seasonOf[a.workerId]
    if (!seasonId) continue
    attendance[attendanceKey(seasonId, a.workerId, a.date)] = {
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
  return { ...seed(), ...old, version: 2, workers, attendance }
}

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

export function removeRecord(name: CollectionName, id: ID) {
  let next: DB = { ...db, [name]: (db[name] as Meta[]).filter((r) => r.id !== id) }
  // remove everything that belongs to the deleted record
  if (name === 'seasons') {
    const cropIds = new Set(db.crops.filter((c) => c.seasonId === id).map((c) => c.id))
    next = dropCropChildren({ ...next, crops: next.crops.filter((c) => !cropIds.has(c.id)) }, cropIds)
    // workers stay (they belong to all seasons); only this season's days are removed
    next = {
      ...next,
      attendance: Object.fromEntries(Object.entries(next.attendance).filter(([, a]) => a.seasonId !== id)),
    }
  }
  if (name === 'crops') next = dropCropChildren(next, new Set([id]))
  if (name === 'workers') {
    next = {
      ...next,
      attendance: Object.fromEntries(Object.entries(next.attendance).filter(([, a]) => a.workerId !== id)),
    }
  }
  commit(next)
}

function dropCropChildren(d: DB, cropIds: Set<ID>): DB {
  const keep = <T extends { cropId: ID }>(list: T[]) => list.filter((r) => !cropIds.has(r.cropId))
  return {
    ...d,
    plantings: keep(d.plantings),
    nutrition: keep(d.nutrition),
    harvests: keep(d.harvests),
    shipments: keep(d.shipments),
  }
}

// ---------- worker days ----------

export function attendanceKey(seasonId: ID, workerId: ID, date: string) {
  return `${seasonId}|${workerId}|${date}`
}

/**
 * Update a worker's day. Missing fields keep their current value; new days take
 * the worker's current salary and pay per box. Passing status null clears the day.
 */
export function setWorkerDay(
  seasonId: ID,
  worker: Worker,
  date: string,
  patch: { status?: DayStatus | null; boxes?: number | null; payPerBox?: number | null },
) {
  const key = attendanceKey(seasonId, worker.id, date)
  const attendance = { ...db.attendance }
  const cur = attendance[key]
  if (patch.status === null) {
    delete attendance[key]
  } else {
    const base: Attendance = cur ?? {
      seasonId,
      workerId: worker.id,
      date,
      status: 'on',
      salary: worker.dailySalary,
      boxes: null,
      payPerBox: worker.payPerBox || null,
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

// ---------- settings ----------

export function setCurrency(currency: string) {
  commit({ ...db, settings: { ...db.settings, currency } })
}

// ---------- helpers ----------

export function seasonLabel(s: Pick<Season, 'startYear'>) {
  return `${s.startYear}–${s.startYear + 1}`
}

export function byDateDesc<T extends { createdAt: string }>(getDate: (r: T) => string) {
  return (a: T, b: T) => getDate(b).localeCompare(getDate(a)) || b.createdAt.localeCompare(a.createdAt)
}
