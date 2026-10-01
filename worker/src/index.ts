/**
 * AgroLedger server (Cloudflare Worker + D1 database).
 * - Sign in with Telegram, farms with a code + password, owner approval for new people
 * - Shared records: each phone sends its changes and gets everyone else's
 * - Telegram bot: approval buttons, weather alerts (see alerts.ts), weekly backup to owners
 */
import { HttpError, farmCode, hashPassword, json, now, randomId, randomToken, safeEqual, sha256Hex } from './util'
import { displayName, setTgBase, tg, verifyInitData, verifyWidget, webhookSecret, type TgUser } from './telegram'
import { runAlerts, weeklyBackups } from './alerts'

export interface Env {
  DB: D1Database
  TELEGRAM_BOT_TOKEN: string
  APP_ORIGIN: string
  TG_API?: string
  BOT_USERNAME: string
}

type Role = 'owner' | 'member'
interface UserRow {
  id: number
  name: string
  username: string | null
  photo: string | null
  lang: string
  tz_offset: number
  alerts_on: number
  alert_hour: number
  can_message: number
  assistant: string | null
}

const COLLS = new Set([
  'seasons',
  'crops',
  'harvests',
  'shipments',
  'expenses',
  'incomes',
  'deals',
  'sales',
  'answers',
  'workers',
  'attendance',
  'meta',
])
/** Only owners may delete these. */
const OWNER_DELETE = new Set(['seasons', 'crops', 'workers'])
const MAX_FAILS = 5
const LOCK_MIN = 15

// ---------- texts the bot sends (by the person's language) ----------
const T: Record<string, Record<string, string>> = {
  uz: {
    joinAsk: '🔔 <b>{name}</b> “{farm}” fermasiga qo‘shilmoqchi.\nKod va parol to‘g‘ri kiritildi.',
    allow: '✅ Ruxsat berish',
    reject: '❌ Rad etish',
    allowed: '✅ {who} ruxsat berdi: {name} “{farm}” fermasiga qo‘shildi.',
    rejected: '❌ {who} rad etdi: {name}.',
    youIn: '✅ Siz “{farm}” fermasiga qo‘shildingiz. AgroLedger’ni oching.',
    youOut: '❌ “{farm}” fermasiga qo‘shilish so‘rovingiz rad etildi.',
    start:
      'Assalomu alaykum! Bu AgroLedger boti.\nOb-havo ogohlantirishlari va fermaga qo‘shilish so‘rovlari shu yerga keladi.\nIlovani ochish uchun pastdagi tugmani bosing.',
    open: 'AgroLedger’ni ochish',
    already: 'Bu so‘rov allaqachon hal qilingan.',
    notOwner: 'Faqat ferma egasi javob bera oladi.',
    aiAsk:
      '🤖 <b>{name}</b> sizning AI yordamchingizdan foydalanmoqchi.\nRuxsat bersangiz, savollari sizning kompyuteringiz va Claude hisobingiz orqali javob oladi.',
    aiAllowed: '✅ {name} endi AI yordamchidan foydalana oladi.',
    aiRejected: '❌ {name} uchun AI yordamchi rad etildi.',
    aiYouIn: '✅ AI yordamchiga ruxsat berildi. AgroLedger’ni oching.',
    aiYouOut: '❌ AI yordamchiga ruxsat berilmadi.',
    aiNotYours: 'Faqat yordamchi egasi javob bera oladi.',
  },
  ru: {
    joinAsk: '🔔 <b>{name}</b> хочет присоединиться к хозяйству «{farm}».\nКод и пароль введены верно.',
    allow: '✅ Разрешить',
    reject: '❌ Отклонить',
    allowed: '✅ {who} разрешил(а): {name} теперь в «{farm}».',
    rejected: '❌ {who} отклонил(а): {name}.',
    youIn: '✅ Вы присоединились к «{farm}». Откройте AgroLedger.',
    youOut: '❌ Запрос на вступление в «{farm}» отклонён.',
    start:
      'Здравствуйте! Это бот AgroLedger.\nСюда приходят предупреждения о погоде и запросы на вступление в хозяйство.\nНажмите кнопку ниже, чтобы открыть приложение.',
    open: 'Открыть AgroLedger',
    already: 'Этот запрос уже решён.',
    notOwner: 'Ответить может только владелец хозяйства.',
    aiAsk:
      '🤖 <b>{name}</b> хочет пользоваться вашим AI-помощником.\nЕсли разрешите, его вопросы будут обрабатываться через ваш компьютер и ваш аккаунт Claude.',
    aiAllowed: '✅ {name} теперь может пользоваться AI-помощником.',
    aiRejected: '❌ {name}: доступ к AI-помощнику отклонён.',
    aiYouIn: '✅ Доступ к AI-помощнику разрешён. Откройте AgroLedger.',
    aiYouOut: '❌ Доступ к AI-помощнику не разрешён.',
    aiNotYours: 'Ответить может только владелец помощника.',
  },
  en: {
    joinAsk: '🔔 <b>{name}</b> wants to join the farm “{farm}”.\nThe code and password were correct.',
    allow: '✅ Allow',
    reject: '❌ Reject',
    allowed: '✅ {who} allowed it: {name} joined “{farm}”.',
    rejected: '❌ {who} rejected: {name}.',
    youIn: '✅ You joined “{farm}”. Open AgroLedger.',
    youOut: '❌ Your request to join “{farm}” was rejected.',
    start: 'Hello! This is the AgroLedger bot.\nWeather alerts and farm join requests come here.\nPress the button below to open the app.',
    open: 'Open AgroLedger',
    already: 'This request was already answered.',
    notOwner: 'Only a farm owner can answer.',
    aiAsk:
      '🤖 <b>{name}</b> wants to use your AI assistant.\nIf you allow it, their questions are answered through your computer and your Claude account.',
    aiAllowed: '✅ {name} can now use the AI assistant.',
    aiRejected: '❌ {name}: AI assistant access rejected.',
    aiYouIn: '✅ You can use the AI assistant now. Open AgroLedger.',
    aiYouOut: '❌ AI assistant access was not allowed.',
    aiNotYours: 'Only the owner of the assistant can answer.',
  },
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function txt(lang: string, key: string, vars: Record<string, string> = {}) {
  const s = (T[lang] ?? T.uz)[key] ?? T.en[key] ?? key
  return s.replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? ''))
}

// ---------- request handling ----------
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    setTgBase(env.TG_API)
    const origin = req.headers.get('Origin')
    const cors: Record<string, string> =
      origin && isAllowedOrigin(origin, env)
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Max-Age': '600',
            Vary: 'Origin',
          }
        : {}
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    try {
      const res = await route(req, env)
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
      return res
    } catch (e) {
      const he = e instanceof HttpError ? e : null
      if (!he) console.error(e)
      return json({ error: he?.code ?? 'server_error' }, he?.status ?? 500, cors)
    }
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    setTgBase(env.TG_API)
    ctx.waitUntil(runAlerts(env))
    const d = new Date(event.scheduledTime)
    // Sunday 15:xx UTC (20:xx in Uzbekistan): weekly backup file to each owner
    if (d.getUTCDay() === 0 && d.getUTCHours() === 15) ctx.waitUntil(weeklyBackups(env))
  },
}

function isAllowedOrigin(origin: string, env: Env) {
  return origin === env.APP_ORIGIN || /^http:\/\/localhost:\d+$/.test(origin)
}

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError(400, 'bad_json')
  }
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const p = url.pathname.replace(/\/+$/, '') || '/'
  const m = (re: RegExp) => p.match(re)
  const M = req.method

  if (p === '/' || p === '/health') return json({ ok: true, app: 'agroledger', bot: env.BOT_USERNAME })
  if (M === 'POST' && p === '/telegram/webhook') return telegramWebhook(req, env)
  if (M === 'POST' && p === '/auth/telegram') return signIn(req, env)

  const user = await auth(req, env)
  if (M === 'POST' && p === '/auth/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await tokenHash(req))
      .run()
    return json({ ok: true })
  }
  if (M === 'GET' && p === '/me') return json(await me(env, user))
  if (M === 'PATCH' && p === '/me') return updateMe(req, env, user)
  if (M === 'POST' && p === '/assistant/request') return assistantRequest(env, user)
  if (M === 'POST' && p === '/farms') return createFarm(req, env, user)
  if (M === 'POST' && p === '/farms/join') return joinFarm(req, env, user)

  let r: RegExpMatchArray | null
  if ((r = m(/^\/farms\/([\w-]+)$/)) && M === 'GET') return farmInfo(env, user, r[1])
  if ((r = m(/^\/farms\/([\w-]+)\/leave$/)) && M === 'POST') return leaveFarm(env, user, r[1])
  if ((r = m(/^\/farms\/([\w-]+)\/members\/(\d+)$/)) && M === 'POST') return memberAction(req, env, user, r[1], Number(r[2]))
  if ((r = m(/^\/farms\/([\w-]+)\/password$/)) && M === 'POST') return changePassword(req, env, user, r[1])
  if ((r = m(/^\/farms\/([\w-]+)\/signout-all$/)) && M === 'POST') return signOutAll(env, user, r[1])
  if ((r = m(/^\/farms\/([\w-]+)\/sync$/)) && M === 'POST') return sync(req, env, user, r[1])
  if ((r = m(/^\/farms\/([\w-]+)\/trash$/)) && M === 'GET') return trash(env, user, r[1])
  if ((r = m(/^\/farms\/([\w-]+)\/restore$/)) && M === 'POST') return restore(req, env, user, r[1])
  throw new HttpError(404, 'not_found')
}

// ---------- sign in ----------
async function tokenHash(req: Request) {
  const h = req.headers.get('Authorization') ?? ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) throw new HttpError(401, 'signed_out')
  return sha256Hex('session:' + token)
}

async function auth(req: Request, env: Env): Promise<UserRow> {
  const th = await tokenHash(req)
  const row = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .bind(th)
    .first<UserRow>()
  if (!row) throw new HttpError(401, 'signed_out')
  await env.DB.prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ?').bind(now(), th).run()
  return row
}

async function signIn(req: Request, env: Env) {
  const b = await body<{
    widget?: Record<string, unknown>
    initData?: string
    device?: string
    lang?: string
    tz?: number
    write?: boolean
  }>(req)
  let u: TgUser | null = null
  let canMessage = false
  if (b.widget) {
    u = await verifyWidget(b.widget, env.TELEGRAM_BOT_TOKEN)
    canMessage = !!b.write // the button asked "allow the bot to message you"
  } else if (b.initData) {
    u = await verifyInitData(b.initData, env.TELEGRAM_BOT_TOKEN)
    canMessage = true // opened from the bot chat
  }
  if (!u || !u.id) throw new HttpError(401, 'telegram_check_failed')
  const lang = ['uz', 'ru', 'en'].includes(b.lang ?? '') ? b.lang! : 'uz'
  const tz = Number.isFinite(b.tz) ? Math.max(-720, Math.min(840, Math.round(b.tz!))) : 300
  const t = now()
  await env.DB.prepare(
    `INSERT INTO users (id, name, username, photo, lang, tz_offset, can_message, created_at, last_seen)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(id) DO UPDATE SET name = ?2, username = ?3, photo = ?4, tz_offset = ?6,
       can_message = MAX(can_message, ?7), last_seen = ?8`,
  )
    .bind(u.id, displayName(u), u.username ?? null, u.photo_url ?? null, lang, tz, canMessage ? 1 : 0, t)
    .run()
  const token = randomToken()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, device, created_at, last_used) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex('session:' + token), u.id, (b.device ?? '').slice(0, 120), t, t)
    .run()
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first<UserRow>()
  return json({ token, ...(await me(env, user!)) })
}

async function me(env: Env, user: UserRow) {
  const farms = await env.DB.prepare(
    `SELECT f.id, f.name, f.code, m.role, m.status FROM members m JOIN farms f ON f.id = m.farm_id
     WHERE m.user_id = ? AND m.status IN ('active', 'pending') ORDER BY m.requested_at`,
  )
    .bind(user.id)
    .all()
  const areq = await env.DB.prepare('SELECT status FROM assistant_requests WHERE user_id = ?').bind(user.id).first<{ status: string }>()
  return {
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      photo: user.photo,
      lang: user.lang,
      alertsOn: !!user.alerts_on,
      alertHour: user.alert_hour,
      canMessage: !!user.can_message,
      assistant: parseAssistant(user.assistant),
      assistantRequest: user.assistant ? null : (areq?.status ?? null),
    },
    farms: farms.results,
    bot: env.BOT_USERNAME,
  }
}

function parseAssistant(v: string | null) {
  try {
    return v ? (JSON.parse(v) as { u: string; k: string }) : null
  } catch {
    return null
  }
}

async function updateMe(req: Request, env: Env, user: UserRow) {
  const b = await body<{ lang?: string; tz?: number; alertsOn?: boolean; alertHour?: number; assistant?: unknown }>(req)
  if ('assistant' in b) {
    const a = b.assistant as { u?: unknown; k?: unknown } | null
    const ok = a && typeof a.u === 'string' && typeof a.k === 'string' && a.u.length < 300 && a.k.length < 300 && /^https?:\/\//.test(a.u)
    await env.DB.prepare('UPDATE users SET assistant = ? WHERE id = ?')
      .bind(ok ? JSON.stringify({ u: a!.u, k: a!.k }) : null, user.id)
      .run()
  }
  const lang = ['uz', 'ru', 'en'].includes(b.lang ?? '') ? b.lang! : user.lang
  const hour = Number.isInteger(b.alertHour) && b.alertHour! >= 0 && b.alertHour! <= 23 ? b.alertHour! : user.alert_hour
  const on = typeof b.alertsOn === 'boolean' ? (b.alertsOn ? 1 : 0) : user.alerts_on
  const tz = Number.isFinite(b.tz) ? Math.round(b.tz!) : user.tz_offset
  await env.DB.prepare('UPDATE users SET lang = ?, alert_hour = ?, alerts_on = ?, tz_offset = ? WHERE id = ?')
    .bind(lang, hour, on, tz, user.id)
    .run()
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>()
  return json(await me(env, u!))
}

// ---------- farms ----------
async function membership(env: Env, user: UserRow, farmId: string) {
  return env.DB.prepare('SELECT role, status FROM members WHERE farm_id = ? AND user_id = ?')
    .bind(farmId, user.id)
    .first<{ role: Role; status: string }>()
}
async function requireMember(env: Env, user: UserRow, farmId: string, owner = false) {
  const m = await membership(env, user, farmId)
  if (!m || m.status !== 'active') throw new HttpError(403, 'not_member')
  if (owner && m.role !== 'owner') throw new HttpError(403, 'owners_only')
  return m
}

function checkPassword(p: unknown) {
  const s = String(p ?? '')
  if (s.length < 6) throw new HttpError(400, 'password_too_short')
  if (s.length > 200) throw new HttpError(400, 'password_too_long')
  return s
}

async function createFarm(req: Request, env: Env, user: UserRow) {
  const b = await body<{ name?: string; password?: string }>(req)
  const name = String(b.name ?? '')
    .trim()
    .slice(0, 80)
  if (!name) throw new HttpError(400, 'name_required')
  const { salt, hash } = await hashPassword(checkPassword(b.password))
  const id = randomId()
  const t = now()
  for (let i = 0; i < 8; i++) {
    const code = farmCode()
    try {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO farms (id, name, code, pass_salt, pass_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).bind(id, name, code, salt, hash, user.id, t),
        env.DB.prepare(
          "INSERT INTO members (farm_id, user_id, role, status, requested_at, decided_by, decided_at) VALUES (?, ?, 'owner', 'active', ?, ?, ?)",
        ).bind(id, user.id, t, user.id, t),
      ])
      return json({ id, name, code, role: 'owner', status: 'active' })
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e // code taken: try another
    }
  }
  throw new HttpError(500, 'no_code')
}

async function joinFarm(req: Request, env: Env, user: UserRow) {
  const b = await body<{ code?: string; password?: string }>(req)
  let code = String(b.code ?? '')
    .toUpperCase()
    .replace(/\s/g, '')
  if (/^\d{4}$/.test(code)) code = 'AL-' + code
  if (/^AL\d{4}$/.test(code)) code = 'AL-' + code.slice(2)

  const att = await env.DB.prepare('SELECT fails, locked_until FROM attempts WHERE user_id = ? AND code = ?')
    .bind(user.id, code)
    .first<{ fails: number; locked_until: string | null }>()
  if (att?.locked_until && att.locked_until > now()) throw new HttpError(429, 'locked')

  const farm = await env.DB.prepare('SELECT * FROM farms WHERE code = ?')
    .bind(code)
    .first<{ id: string; name: string; pass_salt: string; pass_hash: string }>()
  const ok = farm && safeEqual((await hashPassword(String(b.password ?? ''), farm.pass_salt)).hash, farm.pass_hash)
  if (!farm || !ok) {
    const fails = (att?.fails ?? 0) + 1
    const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000).toISOString() : null
    await env.DB.prepare(
      'INSERT INTO attempts (user_id, code, fails, locked_until) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, code) DO UPDATE SET fails = ?3, locked_until = ?4',
    )
      .bind(user.id, code, lock ? 0 : fails, lock)
      .run()
    throw new HttpError(403, lock ? 'locked' : 'wrong_code_or_password')
  }
  await env.DB.prepare('DELETE FROM attempts WHERE user_id = ? AND code = ?').bind(user.id, code).run()

  const existing = await membership(env, user, farm.id)
  if (existing?.status === 'active') return json({ id: farm.id, name: farm.name, code, role: existing.role, status: 'active' })
  await env.DB.prepare(
    `INSERT INTO members (farm_id, user_id, role, status, requested_at) VALUES (?1, ?2, 'member', 'pending', ?3)
     ON CONFLICT(farm_id, user_id) DO UPDATE SET status = 'pending', role = 'member', requested_at = ?3, decided_by = NULL, decided_at = NULL`,
  )
    .bind(farm.id, user.id, now())
    .run()

  // Ask every owner, in their own Telegram
  const owners = await env.DB.prepare(
    "SELECT u.* FROM members m JOIN users u ON u.id = m.user_id WHERE m.farm_id = ? AND m.role = 'owner' AND m.status = 'active'",
  )
    .bind(farm.id)
    .all<UserRow>()
  const who = user.name + (user.username ? ` (@${user.username})` : '')
  for (const o of owners.results) {
    const r = await tg(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: o.id,
      parse_mode: 'HTML',
      text: txt(o.lang, 'joinAsk', { name: who, farm: farm.name }),
      reply_markup: {
        inline_keyboard: [
          [
            { text: txt(o.lang, 'allow'), callback_data: `ok:${farm.id}:${user.id}` },
            { text: txt(o.lang, 'reject'), callback_data: `no:${farm.id}:${user.id}` },
          ],
        ],
      },
    })
    if (!r.ok && r.error_code === 403) await env.DB.prepare('UPDATE users SET can_message = 0 WHERE id = ?').bind(o.id).run()
  }
  return json({ id: farm.id, name: farm.name, code, role: 'member', status: 'pending' })
}

async function farmInfo(env: Env, user: UserRow, farmId: string) {
  const m = await membership(env, user, farmId)
  if (!m || (m.status !== 'active' && m.status !== 'pending')) throw new HttpError(403, 'not_member')
  const farm = await env.DB.prepare('SELECT id, name, code, created_at FROM farms WHERE id = ?').bind(farmId).first()
  if (m.status === 'pending') return json({ farm, role: m.role, status: m.status, members: [] })
  const members = await env.DB.prepare(
    `SELECT u.id, u.name, u.username, u.photo, m.role, m.status, m.requested_at, u.last_seen
     FROM members m JOIN users u ON u.id = m.user_id
     WHERE m.farm_id = ? AND m.status IN ('active', 'pending') ORDER BY m.status = 'pending' DESC, m.role = 'owner' DESC, u.name`,
  )
    .bind(farmId)
    .all()
  return json({ farm, role: m.role, status: m.status, members: members.results })
}

async function decide(env: Env, farmId: string, targetId: number, allow: boolean, by: UserRow, role: Role = 'member') {
  const target = await env.DB.prepare('SELECT * FROM members WHERE farm_id = ? AND user_id = ?')
    .bind(farmId, targetId)
    .first<{ status: string }>()
  if (!target || target.status !== 'pending') return false
  await env.DB.prepare('UPDATE members SET status = ?, role = ?, decided_by = ?, decided_at = ? WHERE farm_id = ? AND user_id = ?')
    .bind(allow ? 'active' : 'rejected', role, by.id, now(), farmId, targetId)
    .run()
  const farm = await env.DB.prepare('SELECT name FROM farms WHERE id = ?').bind(farmId).first<{ name: string }>()
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetId).first<UserRow>()
  if (u)
    await tg(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: u.id,
      parse_mode: 'HTML',
      text: txt(u.lang, allow ? 'youIn' : 'youOut', { farm: farm?.name ?? '' }),
    })
  return true
}

async function memberAction(req: Request, env: Env, user: UserRow, farmId: string, targetId: number) {
  await requireMember(env, user, farmId, true)
  const b = await body<{ action: 'approve' | 'reject' | 'role' | 'remove'; role?: Role }>(req)
  const role: Role = b.role === 'owner' ? 'owner' : 'member'
  if (b.action === 'approve' || b.action === 'reject') {
    if (!(await decide(env, farmId, targetId, b.action === 'approve', user, role))) throw new HttpError(409, 'already_decided')
  } else if (b.action === 'role' || b.action === 'remove') {
    const target = await env.DB.prepare("SELECT role FROM members WHERE farm_id = ? AND user_id = ? AND status = 'active'")
      .bind(farmId, targetId)
      .first<{ role: Role }>()
    if (!target) throw new HttpError(404, 'no_such_member')
    // there must always be at least one owner
    if (target.role === 'owner' && (b.action === 'remove' || role !== 'owner')) {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE farm_id = ? AND role = 'owner' AND status = 'active'")
        .bind(farmId)
        .first<{ n: number }>()
      if ((n?.n ?? 0) <= 1) throw new HttpError(409, 'last_owner')
    }
    if (b.action === 'role')
      await env.DB.prepare('UPDATE members SET role = ? WHERE farm_id = ? AND user_id = ?').bind(role, farmId, targetId).run()
    else {
      await env.DB.prepare("UPDATE members SET status = 'removed', decided_by = ?, decided_at = ? WHERE farm_id = ? AND user_id = ?")
        .bind(user.id, now(), farmId, targetId)
        .run()
    }
  } else throw new HttpError(400, 'bad_action')
  return farmInfo(env, user, farmId)
}

async function leaveFarm(env: Env, user: UserRow, farmId: string) {
  const m = await membership(env, user, farmId)
  if (!m) throw new HttpError(404, 'not_member')
  if (m.role === 'owner' && m.status === 'active') {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE farm_id = ? AND role = 'owner' AND status = 'active'")
      .bind(farmId)
      .first<{ n: number }>()
    if ((n?.n ?? 0) <= 1) throw new HttpError(409, 'last_owner')
  }
  await env.DB.prepare("UPDATE members SET status = 'removed' WHERE farm_id = ? AND user_id = ?").bind(farmId, user.id).run()
  return json({ ok: true })
}

async function changePassword(req: Request, env: Env, user: UserRow, farmId: string) {
  await requireMember(env, user, farmId, true)
  const b = await body<{ password?: string }>(req)
  const { salt, hash } = await hashPassword(checkPassword(b.password))
  await env.DB.prepare('UPDATE farms SET pass_salt = ?, pass_hash = ? WHERE id = ?').bind(salt, hash, farmId).run()
  return json({ ok: true })
}

/** Lost phone: sign out every device of every person in this farm (they sign in again with Telegram). */
async function signOutAll(env: Env, user: UserRow, farmId: string) {
  await requireMember(env, user, farmId, true)
  await env.DB.prepare("DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM members WHERE farm_id = ? AND status = 'active')")
    .bind(farmId)
    .run()
  return json({ ok: true })
}

// ---------- shared records ----------
interface Change {
  coll: string
  id: string
  data: unknown
  deleted?: boolean
  updatedAt: string
}

async function sync(req: Request, env: Env, user: UserRow, farmId: string) {
  const m = await requireMember(env, user, farmId)
  const b = await body<{ changes?: Change[]; since?: number }>(req)
  const changes = (b.changes ?? []).slice(0, 500)
  const rejected: { coll: string; id: string; reason: string }[] = []

  if (changes.length) {
    // current versions, to keep the newest edit when two phones changed the same record
    const farm = await env.DB.prepare('SELECT seq FROM farms WHERE id = ?').bind(farmId).first<{ seq: number }>()
    let seq = farm?.seq ?? 0
    const stmts: D1PreparedStatement[] = []
    for (const c of changes) {
      if (!COLLS.has(c.coll) || typeof c.id !== 'string' || !c.id || c.id.length > 200) {
        rejected.push({ coll: c.coll, id: c.id, reason: 'bad' })
        continue
      }
      if (c.deleted && OWNER_DELETE.has(c.coll) && m.role !== 'owner') {
        rejected.push({ coll: c.coll, id: c.id, reason: 'owners_only' })
        continue
      }
      const data = c.data === undefined ? null : JSON.stringify(c.data)
      if (data && data.length > 200000) {
        rejected.push({ coll: c.coll, id: c.id, reason: 'too_big' })
        continue
      }
      const at = typeof c.updatedAt === 'string' ? c.updatedAt.slice(0, 40) : now()
      seq++
      stmts.push(
        env.DB.prepare(
          `INSERT INTO records (farm_id, coll, id, data, deleted, updated_at, updated_by, seq)
           VALUES (?1, ?2, ?3, COALESCE(?4, '{}'), ?5, ?6, ?7, ?8)
           ON CONFLICT(farm_id, coll, id) DO UPDATE SET
             data = CASE WHEN ?6 >= records.updated_at AND ?4 IS NOT NULL THEN ?4 ELSE records.data END,
             deleted = CASE WHEN ?6 >= records.updated_at THEN ?5 ELSE records.deleted END,
             updated_by = CASE WHEN ?6 >= records.updated_at THEN ?7 ELSE records.updated_by END,
             updated_at = MAX(?6, records.updated_at),
             seq = ?8`,
        ).bind(farmId, c.coll, c.id, data, c.deleted ? 1 : 0, at, user.id, seq),
      )
    }
    if (stmts.length) {
      stmts.push(env.DB.prepare('UPDATE farms SET seq = MAX(seq, ?) WHERE id = ?').bind(seq, farmId))
      await env.DB.batch(stmts)
    }
  }

  const since = Number.isFinite(b.since) ? Number(b.since) : 0
  const LIMIT = 2000
  const rows = await env.DB.prepare(
    `SELECT r.coll, r.id, r.data, r.deleted, r.updated_at, r.seq, u.name AS by_name
     FROM records r LEFT JOIN users u ON u.id = r.updated_by
     WHERE r.farm_id = ? AND r.seq > ? ORDER BY r.seq LIMIT ?`,
  )
    .bind(farmId, since, LIMIT)
    .all<{ coll: string; id: string; data: string; deleted: number; updated_at: string; seq: number; by_name: string | null }>()
  const out = rows.results.map((r) => ({
    coll: r.coll,
    id: r.id,
    data: r.deleted ? null : JSON.parse(r.data),
    deleted: !!r.deleted,
    updatedAt: r.updated_at,
    by: r.by_name,
  }))
  const cursor = rows.results.length ? rows.results[rows.results.length - 1].seq : since
  return json({ changes: out, cursor, more: rows.results.length === LIMIT, rejected, role: m.role })
}

async function trash(env: Env, user: UserRow, farmId: string) {
  await requireMember(env, user, farmId, true)
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const rows = await env.DB.prepare(
    `SELECT r.coll, r.id, r.data, r.updated_at, u.name AS by_name FROM records r LEFT JOIN users u ON u.id = r.updated_by
     WHERE r.farm_id = ? AND r.deleted = 1 AND r.updated_at > ? ORDER BY r.updated_at DESC LIMIT 300`,
  )
    .bind(farmId, since)
    .all<{ coll: string; id: string; data: string; updated_at: string; by_name: string | null }>()
  return json({
    items: rows.results.map((r) => ({ coll: r.coll, id: r.id, data: JSON.parse(r.data), deletedAt: r.updated_at, by: r.by_name })),
  })
}

async function restore(req: Request, env: Env, user: UserRow, farmId: string) {
  await requireMember(env, user, farmId, true)
  const b = await body<{ coll: string; id: string }>(req)
  const farm = await env.DB.prepare('SELECT seq FROM farms WHERE id = ?').bind(farmId).first<{ seq: number }>()
  const seq = (farm?.seq ?? 0) + 1
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE records SET deleted = 0, updated_at = ?, updated_by = ?, seq = ? WHERE farm_id = ? AND coll = ? AND id = ?',
    ).bind(now(), user.id, seq, farmId, b.coll, b.id),
    env.DB.prepare('UPDATE farms SET seq = MAX(seq, ?) WHERE id = ?').bind(seq, farmId),
  ])
  return json({ ok: true })
}

// ---------- AI assistant access for another account ----------
/** People who run the assistant on their computer and share an active farm with this user. */
async function assistantGivers(env: Env, userId: number) {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT u.* FROM members me JOIN members m ON m.farm_id = me.farm_id AND m.status = 'active'
     JOIN users u ON u.id = m.user_id
     WHERE me.user_id = ? AND me.status = 'active' AND u.id != ? AND u.assistant IS NOT NULL`,
  )
    .bind(userId, userId)
    .all<UserRow>()
  return rows.results
}

async function assistantRequest(env: Env, user: UserRow) {
  if (user.assistant) return json({ status: 'approved' })
  const givers = await assistantGivers(env, user.id)
  if (!givers.length) throw new HttpError(409, 'no_assistant_owner')
  const old = await env.DB.prepare('SELECT status, requested_at FROM assistant_requests WHERE user_id = ?')
    .bind(user.id)
    .first<{ status: string; requested_at: string }>()
  // asked less than 10 minutes ago: don't send the message again
  if (old?.status === 'pending' && Date.now() - new Date(old.requested_at).getTime() < 10 * 60000) return json({ status: 'pending' })
  await env.DB.prepare(
    `INSERT INTO assistant_requests (user_id, status, requested_at) VALUES (?, 'pending', ?)
     ON CONFLICT(user_id) DO UPDATE SET status = 'pending', requested_at = excluded.requested_at, decided_by = NULL, decided_at = NULL`,
  )
    .bind(user.id, now())
    .run()
  const who = user.name + (user.username ? ` (@${user.username})` : '')
  let sent = 0
  for (const g of givers) {
    const r = await tg(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: g.id,
      parse_mode: 'HTML',
      text: txt(g.lang, 'aiAsk', { name: who }),
      reply_markup: {
        inline_keyboard: [
          [
            { text: txt(g.lang, 'allow'), callback_data: `aa:${user.id}` },
            { text: txt(g.lang, 'reject'), callback_data: `ar:${user.id}` },
          ],
        ],
      },
    })
    if (r.ok) sent++
  }
  if (!sent) {
    await env.DB.prepare('DELETE FROM assistant_requests WHERE user_id = ?').bind(user.id).run()
    throw new HttpError(409, 'owner_cannot_be_messaged')
  }
  return json({ status: 'pending' })
}

async function decideAssistant(
  env: Env,
  cq: { id: string; from: TgUser; data?: string; message?: { chat: { id: number }; message_id: number } },
) {
  const [kind, uidS] = cq.data!.split(':')
  const uid = Number(uidS)
  const giver = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(cq.from.id).first<UserRow>()
  const lang = giver?.lang ?? 'uz'
  const allowedGiver = giver?.assistant && (await assistantGivers(env, uid)).some((g) => g.id === giver.id)
  if (!giver || !allowedGiver) {
    await tg(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', { callback_query_id: cq.id, text: txt(lang, 'aiNotYours'), show_alert: true })
    return
  }
  const req = await env.DB.prepare('SELECT status FROM assistant_requests WHERE user_id = ?').bind(uid).first<{ status: string }>()
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first<UserRow>()
  const allow = kind === 'aa'
  const done = req?.status === 'pending' && !!target
  if (done) {
    const t0 = now()
    await env.DB.batch([
      env.DB.prepare('UPDATE assistant_requests SET status = ?, decided_by = ?, decided_at = ? WHERE user_id = ?').bind(
        allow ? 'approved' : 'rejected',
        giver.id,
        t0,
        uid,
      ),
      ...(allow ? [env.DB.prepare('UPDATE users SET assistant = ? WHERE id = ?').bind(giver.assistant, uid)] : []),
    ])
    await tg(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: uid,
      text: txt(target!.lang, allow ? 'aiYouIn' : 'aiYouOut'),
      reply_markup: allow
        ? { inline_keyboard: [[{ text: txt(target!.lang, 'open'), web_app: { url: env.APP_ORIGIN + '/' } }]] }
        : undefined,
    })
  }
  await tg(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', { callback_query_id: cq.id, text: done ? '✓' : txt(lang, 'already') })
  if (cq.message) {
    await tg(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      parse_mode: 'HTML',
      text: done
        ? txt(lang, allow ? 'aiAllowed' : 'aiRejected', { name: target!.name + (target!.username ? ` (@${target!.username})` : '') })
        : txt(lang, 'already'),
    })
  }
}

// ---------- Telegram bot ----------
async function telegramWebhook(req: Request, env: Env) {
  const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? ''
  if (!safeEqual(secret, await webhookSecret(env.TELEGRAM_BOT_TOKEN))) return new Response('no', { status: 403 })
  const u = await body<{
    message?: { chat: { id: number; type: string }; from?: TgUser; text?: string }
    callback_query?: { id: string; from: TgUser; data?: string; message?: { chat: { id: number }; message_id: number } }
  }>(req)

  if (u.message?.text?.startsWith('/start') && u.message.chat.type === 'private' && u.message.from) {
    const from = u.message.from
    const lang = ['uz', 'ru', 'en'].includes(from.language_code ?? '') ? from.language_code! : 'uz'
    await env.DB.prepare('UPDATE users SET can_message = 1 WHERE id = ?').bind(from.id).run()
    await tg(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
      chat_id: u.message.chat.id,
      text: txt(lang, 'start'),
      reply_markup: { inline_keyboard: [[{ text: txt(lang, 'open'), web_app: { url: env.APP_ORIGIN + '/' } }]] },
    })
  }

  const cq = u.callback_query
  if (cq?.data && /^a[ar]:\d+$/.test(cq.data)) await decideAssistant(env, cq)
  if (cq?.data && /^(ok|no):/.test(cq.data)) {
    const [kind, farmId, uid] = cq.data.split(':')
    const by = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(cq.from.id).first<UserRow>()
    const lang = by?.lang ?? 'uz'
    const m = by ? await membership(env, by, farmId) : null
    if (!by || m?.status !== 'active' || m.role !== 'owner') {
      await tg(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', { callback_query_id: cq.id, text: txt(lang, 'notOwner'), show_alert: true })
      return json({ ok: true })
    }
    const done = await decide(env, farmId, Number(uid), kind === 'ok', by)
    const target = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(Number(uid)).first<{ name: string }>()
    const farm = await env.DB.prepare('SELECT name FROM farms WHERE id = ?').bind(farmId).first<{ name: string }>()
    await tg(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', { callback_query_id: cq.id, text: done ? '✓' : txt(lang, 'already') })
    if (cq.message) {
      await tg(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        parse_mode: 'HTML',
        text: done
          ? txt(lang, kind === 'ok' ? 'allowed' : 'rejected', { who: by.name, name: target?.name ?? '', farm: farm?.name ?? '' })
          : txt(lang, 'already'),
      })
    }
  }
  return json({ ok: true })
}
