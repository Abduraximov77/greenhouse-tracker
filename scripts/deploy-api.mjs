#!/usr/bin/env node
/**
 * Puts the AgroLedger server on Cloudflare (run by GitHub Actions; the tokens come from repository secrets).
 *  1. makes the D1 database "agroledger" if it doesn't exist, and applies new tables (migrations)
 *  2. gives the account a free workers.dev address if it has none
 *  3. deploys the Worker and gives it the Telegram bot token
 *  4. tells Telegram where to send bot messages, and adds the "AgroLedger" button in the bot
 * Prints url=… and bot=… for the website build.
 *
 *   node scripts/deploy-api.mjs            full deploy
 *   node scripts/deploy-api.mjs --url-only only find the address (scheduled site rebuilds)
 */
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const { CLOUDFLARE_API_TOKEN: CF_TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, TELEGRAM_BOT_TOKEN: BOT_TOKEN, GITHUB_OUTPUT } = process.env
const URL_ONLY = process.argv.includes('--url-only')
const APP = 'https://agroledger-app.github.io'
const WORKER = 'agroledger-api'
const DB_NAME = 'agroledger'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const WDIR = path.join(ROOT, 'worker')

if (!CF_TOKEN || !ACCOUNT || !BOT_TOKEN) {
  console.log('Cloudflare or Telegram secrets are missing: skipping the server.')
  process.exit(0)
}

function out(key, value) {
  console.log(`${key}=${value}`)
  if (GITHUB_OUTPUT) fs.appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`)
}

async function cf(method, p, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${p}`, {
    method,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok && j.success !== false, status: r.status, j }
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return r.json()
}

function run(cmd, args, input) {
  execFileSync(cmd, args, { cwd: WDIR, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit', input, env: process.env })
}

// --- the bot's username ---
const me = await tg('getMe')
if (!me.ok) throw new Error('The Telegram bot token does not work: ' + JSON.stringify(me))
const BOT = me.result.username
out('bot', BOT)

// --- workers.dev address ---
let sub = await cf('GET', '/workers/subdomain')
let subdomain = sub.ok ? sub.j.result?.subdomain : null
if (!subdomain && !URL_ONLY) {
  const name = 'agroledger-' + crypto.randomBytes(3).toString('hex')
  const put = await cf('PUT', '/workers/subdomain', { subdomain: name })
  if (!put.ok) throw new Error('Could not create the workers.dev address: ' + JSON.stringify(put.j.errors ?? put.j))
  subdomain = put.j.result?.subdomain ?? name
  console.log('Created the workers.dev address: ' + subdomain)
}
if (!subdomain) {
  console.log('No workers.dev address yet (the server was never deployed).')
  process.exit(0)
}
const API = `https://${WORKER}.${subdomain}.workers.dev`
if (URL_ONLY) {
  out('url', API)
  process.exit(0)
}

// --- database ---
let list = await cf('GET', `/d1/database?name=${DB_NAME}`)
let dbId = list.ok ? list.j.result?.find((d) => d.name === DB_NAME)?.uuid : null
if (!dbId) {
  const made = await cf('POST', '/d1/database', { name: DB_NAME })
  if (!made.ok) throw new Error('Could not create the database: ' + JSON.stringify(made.j.errors ?? made.j))
  dbId = made.j.result.uuid
  console.log('Created the D1 database')
}
const toml = fs.readFileSync(path.join(WDIR, 'wrangler.toml'), 'utf8')
fs.writeFileSync(
  path.join(WDIR, 'wrangler.toml'),
  toml.replace(/database_id = "[^"]*"/, `database_id = "${dbId}"`).replace(/BOT_USERNAME = "[^"]*"/, `BOT_USERNAME = "${BOT}"`),
)

console.log('Applying database changes…')
run('npx', ['wrangler', 'd1', 'migrations', 'apply', DB_NAME, '--remote'])
console.log('Deploying the server…')
run('npx', ['wrangler', 'deploy'])
console.log('Giving the server the bot token…')
run('npx', ['wrangler', 'secret', 'put', 'TELEGRAM_BOT_TOKEN'], BOT_TOKEN)

// --- Telegram: webhook + menu button ---
const secret = crypto
  .createHash('sha256')
  .update('agroledger-webhook:' + BOT_TOKEN)
  .digest('hex')
  .slice(0, 48)
const hook = await tg('setWebhook', {
  url: `${API}/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: false,
})
console.log('Telegram webhook:', hook.ok ? 'set' : JSON.stringify(hook))
await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'AgroLedger', web_app: { url: APP + '/' } } })
await tg('setMyCommands', { commands: [{ command: 'start', description: 'AgroLedger' }] })

// a brand-new workers.dev address can take a minute to start answering
for (let i = 0; i < 12; i++) {
  try {
    const r = await fetch(API + '/health')
    if (r.ok) {
      console.log('The server answers ✓')
      break
    }
  } catch {
    // not yet
  }
  await new Promise((r) => setTimeout(r, 10000))
}
out('url', API)
