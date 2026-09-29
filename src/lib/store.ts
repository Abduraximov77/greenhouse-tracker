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
  /** The day the seedlings were planted in the ground; the care plan counts days from it. */
  plantedAt?: string | null
  /** Where this crop grows; if empty, the farm's main place (Settings) is used. */
  place?: Place | null
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
  /** Total weight of the load in kg (optional), e.g. 2500 for 444 boxes. */
  totalKg?: number | null
  deliveryPrice: number
  currency: string
  payStatus: PayStatus
  paidAmount: number | null
  destination: string
  note: string
}

/** Workers are shared by every season and crop: add once, use everywhere. */
export interface Worker extends Meta {
  name: string
  phone: string
  gender?: Gender // older workers may not have it yet
  dailySalary: number // 0 if paid only per box
  payPerBox: number // default value for each box prepared
  currency: string // currency of salary and pay per box
}

export type Gender = 'male' | 'female'

export type DayStatus = 'on' | 'off'

/** Whether money owed has been paid: fully, not at all, or partly (paidAmount says how much). */
export type PayStatus = 'unpaid' | 'partial' | 'paid'

export type ExpenseCategory = 'seedlings' | 'nutrition' | 'fuel' | 'repairs' | 'other'
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['seedlings', 'nutrition', 'fuel', 'repairs', 'other']

/** Something bought or paid for on a day: seedlings, fertilizer, fuel, repairs… */
export interface Expense extends Meta {
  cropId: ID
  /** Only on older records; no longer shown or asked for. */
  category?: ExpenseCategory
  date: string
  name: string
  quantity: number | null
  unit: string
  amount: number // total spent
  currency: string
  payStatus: PayStatus
  paidAmount: number | null
  note: string
  /** Money paid to workers entered as an expense (e.g. a day's pay for a group): counted with the workers' costs. */
  forWorkers?: boolean
}

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
  payStatus: PayStatus
  paidAmount: number | null
  updatedAt: string
}

/** A sale of boxes from a truck (added later, once the buyer has taken them). */
export interface Sale extends Meta {
  cropId: ID
  shipmentId: ID
  date: string
  boxes: number
  /** Weight sold in kg; the price is per kg (older sales may have only a price per box). */
  kg?: number | null
  pricePerKg?: number | null
  pricePerBox?: number | null
  amount: number // kg × price per kg (older sales: boxes × price per box)
  currency: string
  buyer: string
  payStatus: PayStatus // has the buyer paid us
  paidAmount: number | null
  note: string
}

/** Money that came in (kirim): a sale, a payment, anything received. */
export interface Income extends Meta {
  cropId: ID
  date: string
  source: string // what the money is from
  from: string // who paid (optional)
  amount: number
  currency: string
  note: string
}

/** One give-or-take with another person (oldi-berdi): money or a product. */
export interface Deal extends Meta {
  cropId: ID
  date: string
  person: string
  direction: 'gave' | 'got' // we gave to them / we got from them
  kind: 'money' | 'product'
  item: string // product name (for products)
  quantity: number | null
  unit: string
  amount: number | null // money given/taken, or the value of the product (optional)
  currency: string
  note: string
  /** Set on a give-back: the entry being returned (always the opposite direction). */
  returnOf?: ID | null
}

export type Lang = 'en' | 'ru' | 'uz'

export interface Settings {
  currency: string // totals are shown in this currency
  lang: Lang
  /** Exchange rates: how many units of each currency equal 1 USD (USD = 1). */
  rates: Record<string, number>
  ratesUpdatedAt: string | null
  ratesSource: RatesSource | null
  /** For Central Bank rates: the date the bank set them for (e.g. "26.09.2026"). */
  ratesDate?: string | null
  /** Screen look: day (light), night (dark) or follow the phone/computer. */
  theme: Theme
  /** Where the farm is: used for the weather forecast and warnings. */
  place?: Place | null
}

/** A place on the map: from the phone's GPS or picked by name. */
export interface Place {
  name: string
  lat: number
  lon: number
  source?: 'gps' | 'search'
  /** For GPS: how exact the reading was, in metres (e.g. 12 = within about 12 m). */
  accuracy?: number | null
  /** True once someone typed the name by hand: it is then never renamed automatically. */
  named?: boolean
}

export type Theme = 'day' | 'night' | 'auto'

/** Where the exchange rates came from: Central Bank of Uzbekistan, another online source, or typed in. */
export type RatesSource = 'cbu' | 'online' | 'manual'

export interface DB {
  version: 7
  seasons: Season[]
  crops: SeasonCrop[]
  harvests: Harvest[]
  shipments: Shipment[]
  expenses: Expense[]
  incomes: Income[]
  deals: Deal[]
  sales: Sale[]
  workers: Worker[]
  attendance: Record<string, Attendance> // key: `${cropId}|${workerId}|${date}`
  settings: Settings
}

type Collections = {
  seasons: Season
  crops: SeasonCrop
  harvests: Harvest
  shipments: Shipment
  expenses: Expense
  incomes: Income
  deals: Deal
  sales: Sale
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
    version: 7,
    seasons: [year, year + 1].map((y) => ({ id: newId(), startYear: y, createdAt: t, updatedAt: t })),
    crops: [],
    harvests: [],
    shipments: [],
    expenses: [],
    incomes: [],
    deals: [],
    sales: [],
    workers: [],
    attendance: {},
    settings: { currency: 'USD', lang: 'en', rates: { USD: 1 }, ratesUpdatedAt: null, ratesSource: null, theme: 'day' },
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
      if (d && d.version === 4) d = migrateV4(d)
      if (d && d.version === 5) d = migrateV5(d)
      if (d && d.version === 6) d = migrateV6(d)
      if (d && d.version === 7) {
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
    version: 7,
    plantings: add(old.plantings),
    nutrition: add(old.nutrition),
    shipments: add(old.shipments),
    workers: add(old.workers),
    attendance: Object.fromEntries(Object.entries(old.attendance ?? {}).map(([k, a]: [string, any]) => [k, { currency: cur, ...a }])),
  }
}
/** v5 adds expenses and payment status on worker days (old days start as not paid). */
function migrateV4(old: any): any {
  return {
    ...old,
    version: 7,
    expenses: old.expenses ?? [],
    attendance: Object.fromEntries(
      Object.entries(old.attendance ?? {}).map(([k, a]: [string, any]) => [k, { payStatus: 'unpaid', paidAmount: null, ...a }]),
    ),
  }
}
/** v6 adds payment status to seedlings, nutrition and deliveries. Existing ones count as paid. */
function migrateV5(old: any): any {
  const add = (list: any[] = []) => list.map((r) => ({ payStatus: 'paid', paidAmount: null, ...r }))
  return {
    ...old,
    version: 7,
    plantings: add(old.plantings),
    nutrition: add(old.nutrition),
    shipments: add(old.shipments),
  }
}
/**
 * v7 folds the separate Seedlings and Nutrition sections into Expenses (with a category).
 * Details that have no field of their own go into the note, in the language in use.
 */
function migrateV6(old: any): any {
  const lang: Lang = old.settings?.lang ?? 'en'
  const L = {
    seedling: { en: 'Seedlings', ru: 'Рассада', uz: 'Ko‘chat' }[lang],
    pcs: { en: 'pcs', ru: 'шт', uz: 'dona' }[lang],
    planted: { en: 'Planted', ru: 'Высажено', uz: 'Ekilgan' }[lang],
    ha: { en: 'ha', ru: 'га', uz: 'ga' }[lang],
  }
  const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ')
  const fromPlanting = (r: any) => ({
    id: r.id,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    cropId: r.cropId,
    category: 'seedlings',
    date: r.arrivedOn,
    name: L.seedling,
    quantity: r.quantity ?? null,
    unit: L.pcs,
    amount: r.totalCost ?? 0,
    currency: r.currency,
    payStatus: r.payStatus ?? 'paid',
    paidAmount: r.paidAmount ?? null,
    note: join(r.supplier, r.plantedOn && `${L.planted}: ${r.plantedOn}`, r.note),
  })
  const fromNutrition = (r: any) => {
    const u = r.unit === 'L' ? 'l' : r.unit
    return {
      id: r.id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      cropId: r.cropId,
      category: 'nutrition',
      date: r.date,
      name: r.product,
      quantity: r.totalAmount ?? null,
      unit: u,
      amount: r.totalCost ?? 0,
      currency: r.currency,
      payStatus: r.payStatus ?? 'paid',
      paidAmount: r.paidAmount ?? null,
      note: join(`${r.ratePerHa} ${u}/${L.ha} × ${r.areaHa} ${L.ha}`, r.note),
    }
  }
  const { plantings, nutrition, ...rest } = old
  return {
    ...rest,
    version: 7,
    expenses: [
      ...(old.expenses ?? []).map((e: any) => ({ category: 'other', ...e })),
      ...(plantings ?? []).map(fromPlanting),
      ...(nutrition ?? []).map(fromNutrition),
    ],
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
  if (name === 'shipments') next = { ...next, sales: next.sales.filter((r) => r.shipmentId !== id) }
  commit(next)
}

function dropCropChildren(d: DB, cropIds: Set<ID>): DB {
  const keep = <T extends { cropId: ID }>(list: T[]) => list.filter((r) => !cropIds.has(r.cropId))
  return dropAttendance(
    {
      ...d,
      harvests: keep(d.harvests),
      shipments: keep(d.shipments),
      expenses: keep(d.expenses),
      incomes: keep(d.incomes),
      deals: keep(d.deals),
      sales: keep(d.sales),
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
  patch: {
    status?: DayStatus | null
    boxes?: number | null
    payPerBox?: number | null
    salary?: number
    payStatus?: PayStatus
    paidAmount?: number | null
  },
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
      payStatus: 'unpaid',
      paidAmount: null,
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

/** Mark every worker off for a day on a crop (on = true), or clear those day-off marks (on = false). */
export function setDayOffForAll(crop: SeasonCrop, workers: Worker[], date: string, on: boolean) {
  const attendance = { ...db.attendance }
  for (const w of workers) {
    const key = attendanceKey(crop.id, w.id, date)
    if (on) {
      attendance[key] = {
        seasonId: crop.seasonId,
        cropId: crop.id,
        workerId: w.id,
        date,
        status: 'off',
        salary: w.dailySalary,
        boxes: null,
        payPerBox: w.payPerBox || null,
        currency: w.currency,
        payStatus: 'unpaid',
        paidAmount: null,
        updatedAt: nowIso(),
      }
    } else if (attendance[key]?.status === 'off') {
      delete attendance[key]
    }
  }
  commit({ ...db, attendance })
}

/** Days from start to end inclusive (YYYY-MM-DD). 0 if end is before start. */
export function daysBetween(start: string, end: string) {
  const [a, b] = [start, end].map((s) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  })
  return b < a ? 0 : Math.round((b - a) / 86400000) + 1
}

/** Money earned on one day: daily salary (if worked) + boxes × pay per box. */
export function dayPay(a: Attendance) {
  if (a.status !== 'on') return 0
  return a.salary + (a.boxes ?? 0) * (a.payPerBox ?? 0)
}

/** How much of an amount is paid and how much is still owed. */
export function payment(due: number, status: PayStatus, paidAmount: number | null) {
  const paid = status === 'paid' ? due : status === 'partial' ? Math.min(paidAmount ?? 0, due) : 0
  return { paid, owed: Math.max(0, due - paid) }
}

/** Mark worked days on a crop as paid (or back to not paid). `match` picks which days. */
export function setWorkerDaysPaid(cropId: ID, match: (a: Attendance) => boolean, paid: boolean) {
  const attendance = { ...db.attendance }
  for (const [k, a] of Object.entries(attendance)) {
    if (a.cropId === cropId && a.status === 'on' && match(a)) {
      attendance[k] = { ...a, payStatus: paid ? 'paid' : 'unpaid', paidAmount: null, updatedAt: nowIso() }
    }
  }
  commit({ ...db, attendance })
}

/** Save payment status for several worker days at once (key → status and amount). */
export function setAttendancePayments(updates: Record<string, { payStatus: PayStatus; paidAmount: number | null }>) {
  const attendance = { ...db.attendance }
  for (const [k, u] of Object.entries(updates)) {
    if (attendance[k]) attendance[k] = { ...attendance[k], ...u, updatedAt: nowIso() }
  }
  commit({ ...db, attendance })
}

/** Worker days for one crop. */
export function cropDays(d: DB, cropId: ID): Attendance[] {
  return Object.values(d.attendance).filter((a) => a.cropId === cropId)
}

// ---------- settings ----------

export function setCurrency(currency: string) {
  commit({ ...db, settings: { ...db.settings, currency } })
}

export function setTheme(theme: Theme) {
  commit({ ...db, settings: { ...db.settings, theme } })
}

export function setPlace(place: Place | null) {
  commit({ ...db, settings: { ...db.settings, place } })
}

export function setLang(lang: Lang) {
  commit({ ...db, settings: { ...db.settings, lang } })
}

/** Save exchange rates (units per 1 USD). */
export function setRates(rates: Record<string, number>, source: RatesSource, date: string | null = null) {
  commit({
    ...db,
    settings: {
      ...db.settings,
      rates: { ...db.settings.rates, ...rates, USD: 1 },
      ratesUpdatedAt: nowIso(),
      ratesSource: source,
      ratesDate: date,
    },
  })
}

// ---------- helpers ----------

export function seasonLabel(s: Pick<Season, 'startYear'>) {
  return String(s.startYear)
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
