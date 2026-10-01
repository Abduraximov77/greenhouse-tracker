// Small helpers: hashing, ids, JSON responses.

const enc = new TextEncoder()

export const hex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))].map((x) => x.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text: string) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

export async function hmac(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}

/** Same length + constant time compare for hex strings. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export function randomToken(bytes = 32) {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomId() {
  return crypto.randomUUID()
}

/** Farm code like AL-4827 (digits only, easy to say on the phone). */
export function farmCode() {
  const b = new Uint32Array(1)
  crypto.getRandomValues(b)
  return 'AL-' + String(1000 + (b[0] % 9000))
}

// Farm passwords: PBKDF2. Kept light because the free plan allows ~10 ms of work per request;
// guessing is also limited to 5 tries per 15 minutes.
const PBKDF2_ITER = 10000
export async function hashPassword(password: string, salt?: string) {
  const s = salt ?? randomToken(16)
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(s), iterations: PBKDF2_ITER }, key, 256)
  return { salt: s, hash: hex(bits) }
}

export const now = () => new Date().toISOString()

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}
