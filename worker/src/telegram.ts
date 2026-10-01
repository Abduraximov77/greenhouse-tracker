import { hex, hmac, safeEqual } from './util'

export interface TgUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  language_code?: string
}

const MAX_AGE_S = 24 * 3600

/**
 * Check the data the "Log in with Telegram" button gives the website.
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export async function verifyWidget(data: Record<string, unknown>, botToken: string): Promise<TgUser | null> {
  const hash = String(data.hash ?? '')
  const pairs = Object.keys(data)
    .filter((k) => k !== 'hash' && data[k] !== undefined && data[k] !== null)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n')
  const secret = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(botToken))
  const sig = hex(await hmac(secret, pairs))
  if (!safeEqual(sig, hash)) return null
  if (Date.now() / 1000 - Number(data.auth_date) > MAX_AGE_S) return null
  return {
    id: Number(data.id),
    first_name: data.first_name as string,
    last_name: data.last_name as string,
    username: data.username as string,
    photo_url: data.photo_url as string,
  }
}

/**
 * Check the data Telegram gives the app when it is opened from the bot (Mini App).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyInitData(initData: string, botToken: string): Promise<TgUser | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash') ?? ''
  params.delete('hash')
  const pairs = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken)
  const sig = hex(await hmac(secret, pairs))
  if (!safeEqual(sig, hash)) return null
  if (Date.now() / 1000 - Number(params.get('auth_date')) > MAX_AGE_S) return null
  try {
    return JSON.parse(params.get('user') ?? 'null') as TgUser
  } catch {
    return null
  }
}

export function displayName(u: TgUser) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || String(u.id)
}

/** Call the Telegram Bot API. Returns null on failure (never throws). */
/** Only for local testing (TG_API in .dev.vars points to a fake Telegram); live it is always Telegram. */
let TG_BASE = 'https://api.telegram.org'
export function setTgBase(base?: string) {
  if (base) TG_BASE = base.replace(/\/+$/, '')
}

export async function tg<T = unknown>(
  botToken: string,
  method: string,
  body: unknown,
): Promise<{ ok: boolean; result?: T; error_code?: number }> {
  try {
    const r = await fetch(`${TG_BASE}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await r.json()) as { ok: boolean; result?: T; error_code?: number }
  } catch {
    return { ok: false }
  }
}

/** Send a file (e.g. the weekly backup) to a chat. */
export async function tgDocument(botToken: string, chatId: number, filename: string, content: string, caption: string) {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('caption', caption)
  form.append('document', new Blob([content], { type: 'application/json' }), filename)
  try {
    const r = await fetch(`${TG_BASE}/bot${botToken}/sendDocument`, { method: 'POST', body: form })
    return ((await r.json()) as { ok: boolean }).ok
  } catch {
    return false
  }
}

/** The secret Telegram sends with each webhook call, so nobody else can call it. */
export async function webhookSecret(botToken: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('agroledger-webhook:' + botToken))).slice(0, 48)
}
