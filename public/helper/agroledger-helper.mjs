#!/usr/bin/env node
/**
 * AgroLedger helper: lets the AgroLedger app ask Claude through Claude Code on YOUR computer,
 * using your own Claude login. For your own use only — the secret key keeps everyone else out.
 *
 * Needs: Node.js 18+ and Claude Code (`claude`) installed and signed in.
 * Optional: `cloudflared`, so your phone and other devices can reach this computer.
 *
 * Start:   node agroledger-helper.mjs
 * Options: --port 4555     port on this computer
 *          --no-tunnel     only this computer (no phone access)
 *          --new-key       make a new secret key (old links stop working)
 *          --model sonnet  Claude model alias
 *
 * Works on macOS, Windows and Linux.
 */
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const PORT = Number(opt('--port', '4555'))
const MODEL = opt('--model', 'sonnet')
const USE_TUNNEL = !args.includes('--no-tunnel')
const APP_URL = 'https://agroledger-app.github.io'
const ALLOWED_ORIGINS = new Set([APP_URL, 'http://localhost:5173', 'http://localhost:4173'])
const JOB_TIMEOUT_MS = 6 * 60 * 1000
const MAX_BODY = 20 * 1024 * 1024 // photos included
const IS_WIN = process.platform === 'win32'

// Sources the assistant may open pages from (it may still search widely, but only reads these).
const TRUSTED_DOMAINS = [
  'fao.org',
  'eppo.int',
  'cabi.org',
  'plantwiseplusknowledgebank.org',
  'worldveg.org',
  'ipm.ucanr.edu',
  'ucanr.edu',
  'vegetables.cornell.edu',
  'cornell.edu',
  'extension.umn.edu',
  'extension.psu.edu',
  'extension.wisc.edu',
  'extension.umd.edu',
  'ag.umass.edu',
  'wur.nl',
  'ahdb.org.uk',
  'rhs.org.uk',
  'apsnet.org',
  'agro.gov.uz',
  'gov.uz',
]

// ---------- secret key (kept in your home folder) ----------
const CONFIG_FILE = path.join(os.homedir(), '.agroledger-helper.json')
function loadKey() {
  if (!args.includes('--new-key')) {
    try {
      const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      if (c.key && c.key.length >= 32) return c.key
    } catch {
      // first start
    }
  }
  const key = crypto.randomBytes(24).toString('base64url')
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ key }, null, 2), { mode: 0o600 })
  return key
}
const KEY = loadKey()

function keyOk(req) {
  const h = req.headers.authorization ?? ''
  const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '')
  const real = Buffer.from(KEY)
  return given.length === real.length && crypto.timingSafeEqual(given, real)
}

// ---------- Claude Code ----------
function claudeVersion() {
  const r = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: IS_WIN })
  return r.status === 0 ? r.stdout.trim() : null
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
function systemPromptFile() {
  const local = path.join(HERE, 'system-prompt.md')
  if (fs.existsSync(local)) return local
  // the prompt ships inside this file too, so a single downloaded file is enough
  const tmp = path.join(os.tmpdir(), 'agroledger-system-prompt.md')
  fs.writeFileSync(tmp, DEFAULT_PROMPT)
  return tmp
}

const LANG_NAMES = { uz: "Uzbek (Latin script, o‘zbekcha)", ru: 'Russian', en: 'English' }

/** One question = one separate Claude Code run (no chat history), so each costs the same. */
function runClaude(job) {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agroledger-q-'))
    const photoNames = []
    for (const [i, img] of (job.images ?? []).entries()) {
      const ext = img.type === 'image/png' ? 'png' : img.type === 'image/webp' ? 'webp' : 'jpg'
      const name = `photo-${i + 1}.${ext}`
      fs.writeFileSync(path.join(dir, name), Buffer.from(img.data, 'base64'))
      photoNames.push(name)
    }
    const prompt = [
      `Answer in ${LANG_NAMES[job.lang] ?? LANG_NAMES.uz}.`,
      '',
      '## Farm data from AgroLedger',
      job.context || '(none)',
      '',
      job.previous ? `## Your earlier answer the farmer is following up on\n${job.previous}\n` : '',
      photoNames.length
        ? `## Photos from the farmer\nLook at each photo with the Read tool before answering: ${photoNames.map((n) => './' + n).join(', ')}\n`
        : '',
      '## Farmer’s question',
      job.question,
    ].join('\n')

    const cliArgs = [
      '-p',
      '--output-format',
      'json',
      '--model',
      MODEL,
      '--no-session-persistence',
      '--max-turns',
      '14',
      '--system-prompt-file',
      systemPromptFile(),
      '--tools',
      'Read,WebSearch,WebFetch',
      '--allowedTools',
      'Read(./**)',
      'WebSearch',
      ...TRUSTED_DOMAINS.map((d) => `WebFetch(domain:${d})`),
    ]
    const child = spawn('claude', IS_WIN ? cliArgs.map((a) => (/[\s()*]/.test(a) ? `"${a}"` : a)) : cliArgs, {
      cwd: dir,
      shell: IS_WIN,
      env: { ...process.env },
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    const timer = setTimeout(() => child.kill(), JOB_TIMEOUT_MS)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ error: 'Claude Code could not start: ' + e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      fs.rmSync(dir, { recursive: true, force: true })
      try {
        const j = JSON.parse(out)
        if (j.is_error) return resolve({ error: String(j.result || j.subtype || 'Claude Code error') })
        resolve({ answer: String(j.result ?? '').trim(), costUsd: j.total_cost_usd ?? null, ms: j.duration_ms ?? null })
      } catch {
        resolve({ error: (err || out || `Claude Code stopped (code ${code})`).trim().slice(0, 600) })
      }
    })
    child.stdin.end(prompt)
  })
}

// ---------- jobs: answers can take a minute or two, so the app asks, then checks back ----------
const jobs = new Map()
const queue = []
let running = false
async function pump() {
  if (running) return
  const job = queue.shift()
  if (!job) return
  running = true
  job.status = 'running'
  job.started = Date.now()
  log(`question ${job.id.slice(0, 6)}: running (${job.images?.length ?? 0} photos)`)
  const r = await runClaude(job)
  Object.assign(job, r, { status: r.error ? 'error' : 'done', finished: Date.now() })
  delete job.images
  log(`question ${job.id.slice(0, 6)}: ${job.status}${r.error ? ' — ' + r.error.slice(0, 120) : ''}`)
  running = false
  pump()
}
setInterval(() => {
  const old = Date.now() - 60 * 60 * 1000
  for (const [id, j] of jobs) if ((j.finished ?? j.created) < old) jobs.delete(id)
}, 10 * 60 * 1000).unref()

// ---------- web server ----------
function cors(req, res) {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Access-Control-Max-Age', '600')
  }
  return !origin || ALLOWED_ORIGINS.has(origin)
}
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('too big'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) return send(res, 403, { error: 'origin not allowed' })
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }
  const url = new URL(req.url, 'http://x')
  if (!keyOk(req)) return send(res, 401, { error: 'wrong key' })

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, claude: claudeVersion(), model: MODEL, busy: running, waiting: queue.length })
  }
  if (req.method === 'POST' && url.pathname === '/ask') {
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return send(res, 400, { error: 'bad request' })
    }
    const question = String(body.question ?? '').trim()
    if (!question) return send(res, 400, { error: 'empty question' })
    const images = Array.isArray(body.images) ? body.images.slice(0, 4).filter((i) => i && typeof i.data === 'string') : []
    const job = {
      id: crypto.randomUUID(),
      status: 'waiting',
      created: Date.now(),
      question: question.slice(0, 4000),
      context: String(body.context ?? '').slice(0, 8000),
      previous: String(body.previous ?? '').slice(0, 6000),
      lang: ['uz', 'ru', 'en'].includes(body.lang) ? body.lang : 'uz',
      images,
    }
    jobs.set(job.id, job)
    queue.push(job)
    pump()
    return send(res, 202, { id: job.id })
  }
  const m = url.pathname.match(/^\/job\/([\w-]+)$/)
  if (req.method === 'GET' && m) {
    const j = jobs.get(m[1])
    if (!j) return send(res, 404, { error: 'not found' })
    const { status, answer, error, costUsd, ms } = j
    return send(res, 200, { status, answer, error, costUsd, ms, position: status === 'waiting' ? queue.indexOf(j) + 1 : 0 })
  }
  send(res, 404, { error: 'not found' })
})

function log(s) {
  console.log(`[${new Date().toLocaleTimeString()}] ${s}`)
}

function linkFor(base) {
  const code = Buffer.from(JSON.stringify({ u: base, k: KEY })).toString('base64url')
  return `${APP_URL}/#/connect/${code}`
}

// ---------- address announcement: linked devices find the new address after a restart ----------
// The address is encrypted with a key made from the secret key, and posted to a private-named topic on
// ntfy.sh (a free message relay). Only devices that have the secret key can find the topic and read it.
const NTFY = 'https://ntfy.sh'
const topic = 'agl-' + crypto.createHash('sha256').update('agroledger-topic:' + KEY).digest('hex').slice(0, 40)
function sealAddress(u) {
  const aesKey = crypto.createHash('sha256').update('agroledger-url:' + KEY).digest()
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', aesKey, iv)
  const body = Buffer.concat([c.update(JSON.stringify({ u, t: Date.now() }), 'utf8'), c.final(), c.getAuthTag()])
  return Buffer.concat([iv, body]).toString('base64url')
}
async function announce(u) {
  try {
    const r = await fetch(`${NTFY}/${topic}`, { method: 'POST', body: sealAddress(u), headers: { 'X-Cache': 'yes' } })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return true
  } catch (e) {
    log('could not share the new address automatically (' + e.message + '); open the new link on your devices instead')
    return false
  }
}

function startTunnel() {
  const probe = spawnSync('cloudflared', ['--version'], { encoding: 'utf8', shell: IS_WIN })
  if (probe.status !== 0) {
    console.log('\n  cloudflared is not installed, so only this computer can use the assistant.')
    console.log('  To use it from your phone too, install cloudflared and start this helper again:')
    console.log('    macOS:   brew install cloudflared')
    console.log('    Windows: winget install --id Cloudflare.cloudflared')
    console.log('    Linux:   see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n')
    return
  }
  const t = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], { shell: IS_WIN })
  let shown = false
  const watch = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    if (m && !shown) {
      shown = true
      const addr = m[0]
      console.log('\n  ✅ Ready for all your devices.')
      console.log('  New device? Open this link on it once (phone, laptop):\n')
      console.log('  ' + linkFor(addr) + '\n')
      console.log('  Devices you already linked find this new address by themselves — nothing to do on them.')
      console.log('  Keep the link private: anyone with it can ask through your Claude account.\n')
      announce(addr)
      // messages on the relay last about 12 hours, so share the address again every 6 hours
      setInterval(() => announce(addr), 6 * 60 * 60 * 1000).unref()
    }
  }
  t.stdout.on('data', watch)
  t.stderr.on('data', watch)
  t.on('close', () => log('tunnel stopped'))
  process.on('exit', () => t.kill())
  process.on('SIGINT', () => process.exit(0))
}

server.listen(PORT, '127.0.0.1', () => {
  const v = claudeVersion()
  console.log('\n  AgroLedger helper')
  console.log(v ? `  Claude Code: ${v} · model: ${MODEL}` : '  ⚠ Claude Code (claude) was not found. Install it and sign in first: https://code.claude.com')
  console.log(`  Link for this computer only:\n  ${linkFor(`http://127.0.0.1:${PORT}`)}`)
  if (USE_TUNNEL) startTunnel()
  console.log('  Leave this window open. Press Ctrl+C to stop.\n')
})

// ---------- built-in instructions for Claude (used when system-prompt.md is not next to this file) ----------
const DEFAULT_PROMPT = `You are the crop assistant inside AgroLedger, a record-keeping app of one family's greenhouse farm.
You answer the farmer's question about their crops, using the farm data the app sends, their description and their photos.

How to answer
- Answer in the language the message asks for. Use simple, practical words a farmer uses. No filler.
- Keep it short: at most about 250 words. Start with the most likely answer, then clear steps.
- Use the farm data (crop, variety, area, place, days since planting, weather, recent work) to make the advice fit.
  If something important is missing (for example soil test, irrigation type, what was already sprayed), say what is
  missing in one line at the end and ask for it.
- Plain Markdown only: short paragraphs, "-" bullets, **bold**, and links as [title](url). No tables, no headings.

Photos
- Look at every photo with the Read tool. Say what you actually see. Give the most likely causes in order and how sure you
  are. Many problems look alike (nutrient shortage, disease, pests, heat or water stress): say so when a photo is not enough,
  and tell the farmer what to check (underside of leaves, roots, new vs old leaves) or to show a local agronomist or lab.

Sources
- Facts about diseases, pests, nutrition and chemicals must agree with trusted organizations: FAO, EPPO, CABI,
  the World Vegetable Center, university extension services (for example UC IPM, Cornell, Minnesota, Penn State),
  Wageningen University, AHDB, and Uzbekistan's Ministry of Agriculture.
- Search the web when you need a fact you are not sure of, and open pages only from those organizations.
- End with "Manbalar:" (or "Источники:"/"Sources:" by language) and 1–3 links you actually used. Never invent a source or link.
  If you answered from general knowledge without checking, say so instead of listing sources.

Safety
- Prefer prevention and non-chemical steps first (ventilation, hygiene, removing sick leaves, traps, biological control).
- When a chemical is needed, name the active ingredient, not a brand; tell them to follow the label exactly, to use only products
  registered in Uzbekistan, to wear protection, and to respect the waiting time before harvest.
- Give doses only when a trusted source or product label gives them, and say where the number comes from. Otherwise say to
  follow the label. Never guess a dose.
- If something could be dangerous to people or animals, say so plainly.
`
