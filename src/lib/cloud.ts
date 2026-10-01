import { useSyncExternalStore } from 'react'
import { allAsChanges, applyRemote, backupLocal, clearFarmData, currentSettings, hasOwnData, setCommitHook, type SyncChange } from './store'

/**
 * The shared farm: sign in with Telegram, then every change on this phone is sent to the farm's
 * database and changes from the family's other phones come back. Works offline too: changes wait
 * on the phone and are sent when the internet is back.
 */

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? ''
export const BOT_USERNAME: string = (import.meta.env.VITE_BOT_USERNAME as string | undefined) ?? 'agroledger_family_bot'
export const cloudAvailable = () => !!API_URL

export interface CloudUser {
  id: number
  name: string
  username: string | null
  photo: string | null
  lang: string
  alertsOn: boolean
  alertHour: number
  canMessage: boolean
  /** this person's own AI-assistant link, if they linked one on any device */
  assistant?: { u: string; k: string } | null
  /** asked to use someone else's assistant: pending | rejected */
  assistantRequest?: string | null
  /** this person runs the assistant and answers access requests */
  assistantOwner?: boolean
}
export interface FarmRef {
  id: string
  name: string
  code: string
  role: 'owner' | 'member'
  status: 'active' | 'pending'
}
interface Session {
  token: string
  user: CloudUser
  farms: FarmRef[]
  farmId: string | null
  /** chose "Change farm": stay signed in, show the create / join / open-farm page */
  picking?: boolean
}
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error'
interface State {
  session: Session | null
  status: SyncStatus
  lastSync: string | null
  pending: number
  error: string | null
}

const SESSION_KEY = 'agroledger:session'
const PENDING_KEY = 'agroledger:pending'
const CURSOR_KEY = 'agroledger:cursor'

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked
  }
}

// changes waiting to be sent, newest per record
let pending: Record<string, SyncChange> = read(PENDING_KEY, {})
let state: State = {
  session: read<Session | null>(SESSION_KEY, null),
  status: 'off',
  lastSync: null,
  pending: Object.keys(pending).length,
  error: null,
}
const listeners = new Set<() => void>()
function set(patch: Partial<State>) {
  state = { ...state, ...patch, pending: Object.keys(pending).length }
  if ('session' in patch) write(SESSION_KEY, state.session)
  listeners.forEach((f) => f())
}
export function subscribeCloud(f: () => void) {
  listeners.add(f)
  return () => listeners.delete(f)
}
export const getCloud = () => state
export function useCloud() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => state,
  )
}
/** Members (not owners) cannot delete seasons, crops or workers. */
export function useCanDeleteCore() {
  const c = useCloud()
  const f = c.session?.farms.find((x) => x.id === c.session?.farmId && x.status === 'active')
  return !f || f.role === 'owner'
}
export const activeFarm = () => {
  const s = state.session
  return s?.farms.find((f) => f.id === s.farmId && f.status === 'active') ?? null
}

// ---------- server calls ----------
export class CloudError extends Error {}
async function api<T>(method: string, path: string, body?: unknown, token = state.session?.token): Promise<T> {
  if (!API_URL) throw new CloudError('not_configured')
  let r: Response
  try {
    r = await fetch(API_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new CloudError('offline')
  }
  const j = (await r.json().catch(() => ({}))) as { error?: string }
  if (r.status === 401 && token) {
    // signed out (e.g. "sign out all devices"): forget the session, keep the data on the phone
    stopSync()
    set({ session: null, status: 'off' })
  }
  if (!r.ok) throw new CloudError(j.error || `http_${r.status}`)
  return j as T
}

interface MeResponse {
  user: CloudUser
  farms: FarmRef[]
  token?: string
}

function deviceName() {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua)
    ? 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : 'Device'
  const br = /Telegram/.test(ua)
    ? 'Telegram'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox/.test(ua)
            ? 'Firefox'
            : ''
  return [os, br].filter(Boolean).join(' · ')
}

async function finishSignIn(res: MeResponse) {
  const old = state.session
  // the farm this device was working in (also after being signed out), so its unsent changes go there
  const lastFarm = old?.farmId ?? read<{ farmId: string } | null>(CURSOR_KEY, null)?.farmId
  const farmId =
    res.farms.find((f) => f.id === lastFarm && f.status === 'active')?.id ?? res.farms.find((f) => f.status === 'active')?.id ?? null
  set({ session: { token: res.token!, user: res.user, farms: res.farms, farmId }, error: null })
  if (!farmId) return
  // first time this farm opens on this phone: show the farm's records (this phone's old data is kept as a backup)
  if (cursorFor(farmId) === 0) await enterFarm(farmId, 'replace')
  else startSync()
}

export async function signInWithWidget(data: Record<string, unknown>) {
  const res = await api<MeResponse>(
    'POST',
    '/auth/telegram',
    { widget: data, write: true, device: deviceName(), lang: currentSettings().lang, tz: -new Date().getTimezoneOffset() },
    '',
  )
  await finishSignIn(res)
}

export async function signInWithInitData(initData: string) {
  const res = await api<MeResponse>(
    'POST',
    '/auth/telegram',
    { initData, device: deviceName(), lang: currentSettings().lang, tz: -new Date().getTimezoneOffset() },
    '',
  )
  await finishSignIn(res)
}

/** Get the latest account and farms. `open`: when a farm becomes available, open it on this phone. */
export async function refreshMe(open = true) {
  if (!state.session) return
  const res = await api<MeResponse>('GET', '/me')
  const s = state.session
  if (!s) return
  const farmId = res.farms.some((f) => f.id === s.farmId && f.status === 'active')
    ? s.farmId
    : s.picking
      ? null
      : (res.farms.find((f) => f.status === 'active')?.id ?? null)
  const switched = farmId !== s.farmId
  set({ session: { ...s, user: res.user, farms: res.farms, farmId } })
  if (open && switched && farmId) await enterFarm(farmId, 'replace')
}

export async function updateMe(patch: {
  lang?: string
  alertsOn?: boolean
  alertHour?: number
  assistant?: { u: string; k: string } | null
}) {
  const res = await api<MeResponse>('PATCH', '/me', { ...patch, tz: -new Date().getTimezoneOffset() })
  if (state.session) set({ session: { ...state.session, user: res.user, farms: res.farms } })
}

/** Ask the person who runs the AI assistant (in the same farm) to allow this account; they answer in Telegram. */
export async function requestAssistant() {
  await api('POST', '/assistant/request')
  await refreshMe(false)
}

/**
 * "Change farm": stay signed in with Telegram, close this farm on this device and show the page to
 * create a farm, join one, or open another of your farms. Unsent changes are sent first.
 */
export async function chooseFarm() {
  const s = state.session
  if (!s) return
  await waitForSync()
  if (Object.keys(pending).length) {
    await syncNow()
    if (Object.keys(pending).length) throw new CloudError('unsent')
  }
  stopSync()
  set({ session: { ...state.session!, farmId: null, picking: true } })
}

/** Open one of your farms (from the farm page). Its records are downloaded fresh. */
export async function openFarm(farmId: string) {
  await enterFarm(farmId, 'replace')
}

/** Inside the Telegram app the person is always known: sign in again by itself. */
const TG_KEY = 'agroledger:tg-launch'
export function insideTelegram() {
  try {
    return !!sessionStorage.getItem(TG_KEY)
  } catch {
    return false
  }
}
export async function signInInsideTelegram() {
  let data: string | null = null
  try {
    data = sessionStorage.getItem(TG_KEY)
  } catch {
    // storage blocked
  }
  if (data) await signInWithInitData(data)
}

export interface AssistantPerson {
  id: number
  name: string
  username: string | null
  pass: string | null
}
/** For the assistant's owner: who uses the assistant through them, and taking it away. */
export const assistantPeople = () => api<{ people: AssistantPerson[] }>('GET', '/assistant/people')
export const revokeAssistant = (userId: number) => api<{ people: AssistantPerson[] }>('POST', '/assistant/revoke', { userId })

export async function signOut() {
  try {
    await api('POST', '/auth/logout')
  } catch {
    // offline: forget it here anyway
  }
  stopSync()
  set({ session: null, status: 'off' })
}

export async function createFarm(name: string, password: string, moveMyData: boolean) {
  const farm = await api<FarmRef>('POST', '/farms', { name, password })
  if (state.session) set({ session: { ...state.session, picking: false } })
  await refreshMe(false)
  await enterFarm(farm.id, moveMyData ? 'upload' : 'replace')
  return farm
}

export async function joinFarm(code: string, password: string) {
  const farm = await api<FarmRef>('POST', '/farms/join', { code, password })
  if (state.session) set({ session: { ...state.session, picking: false } })
  await refreshMe()
  return farm
}

export interface Member {
  id: number
  name: string
  username: string | null
  photo: string | null
  role: 'owner' | 'member'
  status: 'active' | 'pending'
  last_seen: string | null
}
export interface FarmInfo {
  farm: { id: string; name: string; code: string; created_at: string }
  role: 'owner' | 'member'
  status: string
  members: Member[]
}
export const farmInfo = (id: string) => api<FarmInfo>('GET', `/farms/${id}`)
export const memberAction = (farmId: string, userId: number, action: 'approve' | 'reject' | 'role' | 'remove', role?: 'owner' | 'member') =>
  api<FarmInfo>('POST', `/farms/${farmId}/members/${userId}`, { action, role })
export const changeFarmPassword = (farmId: string, password: string) => api('POST', `/farms/${farmId}/password`, { password })
export async function signOutEverywhere(farmId: string) {
  await api('POST', `/farms/${farmId}/signout-all`)
  stopSync()
  set({ session: null, status: 'off' })
}
export async function leaveFarm(farmId: string) {
  await api('POST', `/farms/${farmId}/leave`)
  await refreshMe()
}
export interface TrashItem {
  coll: string
  id: string
  data: Record<string, unknown>
  deletedAt: string
  by: string | null
}
export const trashList = (farmId: string) => api<{ items: TrashItem[] }>('GET', `/farms/${farmId}/trash`)
export async function restoreItem(farmId: string, coll: string, id: string) {
  await api('POST', `/farms/${farmId}/restore`, { coll, id })
  await syncNow()
}

/**
 * Open a farm on this phone.
 * - 'upload': move this phone's records into the (new) farm;
 * - 'replace': show the farm's records (this phone's old data is kept as a backup copy).
 */
export async function enterFarm(farmId: string, mode: 'upload' | 'replace') {
  if (!state.session) return
  // never drop changes not yet sent to the farm that is open now: send them first, or stop
  if (state.session.farmId && state.session.farmId !== farmId) {
    await waitForSync()
    if (Object.keys(pending).length) await syncNow()
    if (Object.keys(pending).length) throw new CloudError('unsent')
  }
  await waitForSync()
  const s = state.session
  if (!s) return
  stopSync()
  if (mode === 'replace') {
    // keep a copy of this phone's records first; if they were never in a farm and can't be copied, stop
    const copied = backupLocal(new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'))
    if (!copied && !read<{ farmId: string } | null>(CURSOR_KEY, null) && hasOwnData()) {
      startSync()
      throw new CloudError('no_space')
    }
  }
  // changes that could not be sent (e.g. removed from that farm) are kept aside, never just dropped
  if (Object.keys(pending).length) {
    try {
      // keep only the 3 newest such copies
      const old = Object.keys(localStorage)
        .filter((k) => k.startsWith('agroledger:unsent-'))
        .sort()
      for (const k of old.slice(0, Math.max(0, old.length - 2))) localStorage.removeItem(k)
      localStorage.setItem(`agroledger:unsent-${Date.now()}`, JSON.stringify(Object.values(pending)))
    } catch {
      // no room
    }
  }
  pending = {}
  if (mode === 'upload') for (const c of allAsChanges()) pending[`${c.coll}|${c.id}`] = c
  else clearFarmData()
  write(PENDING_KEY, pending)
  write(CURSOR_KEY, { farmId, cursor: 0 })
  set({ session: { ...s, farmId, picking: false } })
  startSync()
  await syncNow()
}

// ---------- sync loop ----------
let timer: ReturnType<typeof setTimeout> | null = null
let poll: ReturnType<typeof setInterval> | null = null
let running = false
let again = false

function cursorFor(farmId: string) {
  const c = read<{ farmId: string; cursor: number } | null>(CURSOR_KEY, null)
  return c && c.farmId === farmId ? c.cursor : 0
}

export function startSync() {
  if (!activeFarm()) return
  setCommitHook((changes) => {
    for (const c of changes) pending[`${c.coll}|${c.id}`] = c
    write(PENDING_KEY, pending)
    set({})
    schedule(1200)
  })
  if (!poll) poll = setInterval(() => void syncNow(), 20000)
  set({ status: navigator.onLine === false ? 'offline' : 'idle' })
  schedule(50)
}

export function stopSync() {
  setCommitHook(null)
  if (poll) clearInterval(poll)
  poll = null
  if (timer) clearTimeout(timer)
  timer = null
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

let errorAt = 0
// changes sent per request; made smaller when the server says a request is too big
let batchSize = 400

async function waitForSync() {
  for (let i = 0; running && i < 300; i++) await new Promise((r) => setTimeout(r, 100))
}

export async function syncNow() {
  const farm = activeFarm()
  if (!farm) return
  if (running) {
    again = true
    return
  }
  running = true
  set({ status: 'syncing' })
  try {
    let more = true
    while (more) {
      const batch = Object.values(pending).slice(0, batchSize)
      const res = await api<{
        changes: SyncChange[]
        cursor: number
        more: boolean
        rejected: { coll: string; id: string; reason: string }[]
        role: string
      }>('POST', `/farms/${farm.id}/sync`, { changes: batch, since: cursorFor(farm.id) })
      // sent: forget them, unless changed again meanwhile
      for (const c of batch) {
        const k = `${c.coll}|${c.id}`
        if (pending[k] === c) delete pending[k]
      }
      write(PENDING_KEY, pending)
      // apply what others changed (skip records still waiting to be sent from here)
      const incoming = res.changes.filter((c) => !pending[`${c.coll}|${c.id}`])
      applyRemote(incoming)
      write(CURSOR_KEY, { farmId: farm.id, cursor: res.cursor })
      // role changed by an owner (e.g. made member): show the right buttons
      const sNow = state.session
      if (sNow && res.role && sNow.farms.some((x) => x.id === farm.id && x.role !== res.role))
        set({ session: { ...sNow, farms: sNow.farms.map((x) => (x.id === farm.id ? { ...x, role: res.role as FarmRef['role'] } : x)) } })
      if (res.rejected.length) {
        // not allowed (e.g. a member deleting a crop): get the farm's version back
        errorAt = Date.now()
        set({ error: res.rejected.some((r) => r.reason === 'owners_only') ? 'owners_only' : 'rejected' })
        write(CURSOR_KEY, { farmId: farm.id, cursor: 0 })
        again = true
      }
      more = res.more || Object.keys(pending).length > 0
      if (!res.more && batch.length === 0) more = false
    }
    // a "put back" message stays for 20 seconds so it can be read
    const keepError = again || Date.now() - errorAt < 20000
    set({ status: 'idle', lastSync: new Date().toISOString(), ...(keepError ? {} : { error: null }) })
  } catch (e) {
    const msg = (e as Error).message
    set({ status: msg === 'offline' ? 'offline' : 'error', error: msg === 'offline' ? null : msg })
    // too much at once: send fewer changes per request next time
    if (msg === 'too_big' && batchSize > 1) {
      batchSize = Math.max(1, Math.floor(batchSize / 4))
      again = true
    }
    // the farm is full: retrying won't help
    if (msg === 'farm_full') stopSync()
    // no longer in this farm: stop trying every 20 seconds; the account check moves the phone on
    if (msg === 'not_member') {
      stopSync()
      void refreshMe().catch(() => {})
    }
  } finally {
    running = false
    if (again) {
      again = false
      schedule(300)
    }
  }
}

// ---------- start on page load ----------
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void syncNow()
      void refreshMe().catch(() => {})
    }
  })
  // opened from the Telegram bot: sign in automatically
  const launch = API_URL ? takeTelegramLaunchData() : null
  const launchUser = launch ? telegramUserId(launch) : null
  if (launch && state.session && launchUser !== null && launchUser !== state.session.user.id) {
    // opened in Telegram by a different person than the one signed in here: send what is waiting, then switch
    void (async () => {
      await syncNow().catch(() => {})
      await signInWithInitData(launch).catch(() => {})
    })()
  } else if (launch && !state.session) void signInWithInitData(launch).catch(() => {})
  else if (state.session && API_URL) {
    if (activeFarm()) startSync()
    void refreshMe().catch(() => {})
  }
}

/**
 * Opened from the Telegram bot (Mini App): Telegram puts the signed-in person's data in the address
 * after "#tgWebAppData=". Sign in with it, then clean the address so the app's pages work.
 */
function telegramUserId(initData: string): number | null {
  try {
    const u = JSON.parse(new URLSearchParams(initData).get('user') ?? 'null') as { id?: number } | null
    return typeof u?.id === 'number' ? u.id : null
  } catch {
    return null
  }
}

export function takeTelegramLaunchData(): string | null {
  const h = location.hash
  if (!h.includes('tgWebAppData=')) return null
  const params = new URLSearchParams(h.slice(1))
  const data = params.get('tgWebAppData')
  try {
    if (data) sessionStorage.setItem(TG_KEY, data)
  } catch {
    // storage blocked
  }
  history.replaceState(null, '', location.pathname + location.search + '#/')
  return data
}
