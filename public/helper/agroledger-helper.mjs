#!/usr/bin/env node
/**
 * AgroLedger helper: lets the AgroLedger app ask Claude through Claude Code on YOUR computer,
 * using your own Claude login. For your own use only — the secret key keeps everyone else out.
 *
 * Needs: Node.js 18+ and Claude Code (`claude`) installed and signed in.
 * Optional: `cloudflared`, so your phone and other devices can reach this computer.
 *
 * Start:   node agroledger-helper.mjs
 *          It keeps itself up to date: every hour it checks the AgroLedger site for a newer version,
 *          downloads it and restarts the question-answering part, keeping the same secure address.
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
// The helper runs as two processes: a small "supervisor" (tunnel, keep-awake, updates) and a "worker"
// (answers questions). Updating only restarts the worker, so the secure address stays the same.
const IS_WORKER = args.includes('--worker')
const SELF = fileURLToPath(import.meta.url)
const VERSION = crypto.createHash('sha256').update(fs.readFileSync(SELF)).digest('hex').slice(0, 8)
const UPDATE_EVERY_MS = 60 * 60 * 1000
const UPDATE_URL = process.env.AGL_UPDATE_URL || `${APP_URL}/helper/agroledger-helper.mjs`

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
      `Answer in the same language the farmer wrote the question in (Uzbek, Russian, English…). Uzbek written in Latin letters, even with typos, is Uzbek: answer in Uzbek (Latin script). If the language is unclear, use ${LANG_NAMES[job.lang] ?? LANG_NAMES.uz}.`,
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
      '20',
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
    return false
  }
  let tries = 0
  let announcer = null
  const run = () => {
    tries++
    // http2 goes over normal HTTPS (TCP 443); the default (QUIC, UDP 7844) is often blocked, e.g. in China.
    const t = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${PORT}`], {
      shell: IS_WIN,
    })
    let shown = false
    let connected = false
    let lastWarn = 0
    const watch = (d) => {
      const text = String(d)
      if (/Registered tunnel connection/i.test(text) && !connected) {
        connected = true
        tries = 0
        log('secure address is connected ✓ (phone and other devices can reach this computer)')
      }
      if (/ERR|failed to|unable to/i.test(text) && Date.now() - lastWarn > 30000) {
        lastWarn = Date.now()
        const line = text.split('\n').find((l) => /ERR|failed to|unable to/i.test(l)) ?? ''
        log('⚠ the secure address cannot connect to Cloudflare: ' + line.replace(/^.*?(ERR|INF|WRN)\s*/, '').slice(0, 160))
        log('  Your internet blocks it. Turn on your VPN in global / TUN ("all traffic" / "enhanced") mode — it keeps trying by itself.')
      }
      // the real address (never Cloudflare's own api.trycloudflare.com, which appears in error lines)
      const m = text.match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/)
      if (m && !shown && !/error|failed/i.test(text)) {
        shown = true
        const addr = m[0]
        console.log('\n  ✅ Ready for all your devices.')
        console.log('  New device? Open this link on it once (phone, laptop):\n')
        console.log('  ' + linkFor(addr) + '\n')
        console.log('  Devices you already linked find this new address by themselves — nothing to do on them.')
        console.log('  Keep the link private: anyone with it can ask through your Claude account.\n')
        announce(addr)
        // messages on the relay last about 12 hours, so share the address again every 6 hours
        if (announcer) clearInterval(announcer)
        announcer = setInterval(() => announce(addr), 6 * 60 * 60 * 1000)
        announcer.unref()
      }
    }
    t.stdout.on('data', watch)
    t.stderr.on('data', watch)
    current = t
    t.on('close', () => {
      const wait = Math.min(120, 15 * tries)
      log(`secure address stopped; trying again in ${wait} seconds (no need to restart this helper)`)
      setTimeout(run, wait * 1000)
    })
  }
  let current = null
  process.on('exit', () => current?.kill())
  run()
  return true
}

if (IS_WORKER) {
  // ---------- worker: answers questions ----------
  process.on('SIGTERM', () => process.exit(0))
  process.on('SIGINT', () => process.exit(0))
  server.listen(PORT, '127.0.0.1')
} else {
  supervise()
}

function supervise() {
  const v = claudeVersion()
  console.log('\n  AgroLedger helper · version ' + VERSION)
  console.log(v ? `  Claude Code: ${v} · model: ${MODEL}` : '  ⚠ Claude Code (claude) was not found. Install it and sign in first: https://code.claude.com')

  // keep the Mac awake while the helper runs (no need to type caffeinate)
  if (process.platform === 'darwin') {
    const c = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' })
    c.on('error', () => {})
  }

  let worker = null
  let stopping = false
  let restarting = false
  function startWorker() {
    worker = spawn(process.execPath, [SELF, ...args.filter((a) => a !== '--new-key'), '--worker'], { stdio: 'inherit' })
    worker.on('exit', (code) => {
      worker = null
      if (stopping) return
      if (!restarting) log(`answering part stopped (code ${code}); starting it again`)
      restarting = false
      setTimeout(startWorker, 1500)
    })
  }
  startWorker()

  // Safari blocks a secure website from talking to http://127.0.0.1, so the local link is shown only
  // when there is no tunnel (it works in Chrome and Firefox on this computer).
  if (USE_TUNNEL && startTunnel()) console.log('  Starting the secure address… (about 10–20 seconds)')
  else console.log(`  Link for this computer only (use Chrome or Firefox; Safari blocks it):\n  ${linkFor(`http://127.0.0.1:${PORT}`)}`)
  console.log('  Leave this window open. Press Ctrl+C to stop.\n')

  const stop = () => {
    stopping = true
    worker?.kill('SIGTERM')
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  // ---------- updates ----------
  async function workerBusy() {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`, { headers: { Authorization: `Bearer ${KEY}` } })
      const h = await r.json()
      return h.busy || h.waiting > 0
    } catch {
      return false
    }
  }
  async function checkUpdate() {
    try {
      const r = await fetch(`${UPDATE_URL}?t=${Date.now()}`, { cache: 'no-store' })
      if (!r.ok) return
      const text = await r.text()
      if (!text.includes('AgroLedger helper') || text === fs.readFileSync(SELF, 'utf8')) return
      const tmp = SELF.replace(/\.mjs$/, '') + '.new.mjs' // .mjs so the syntax check reads it as a module
      fs.writeFileSync(tmp, text)
      if (spawnSync(process.execPath, ['--check', tmp]).status !== 0) {
        fs.rmSync(tmp, { force: true })
        return
      }
      // wait until no question is being answered
      for (let i = 0; i < 60 && (await workerBusy()); i++) await new Promise((res) => setTimeout(res, 10000))
      fs.renameSync(tmp, SELF)
      const nv = crypto.createHash('sha256').update(text).digest('hex').slice(0, 8)
      log(`updated to version ${nv}; restarting the answering part (same address, nothing to do on your devices)`)
      restarting = true
      worker?.kill('SIGTERM')
    } catch {
      // offline: try again later
    }
  }
  setTimeout(checkUpdate, Number(process.env.AGL_UPDATE_FIRST_MS) || 15000)
  setInterval(checkUpdate, UPDATE_EVERY_MS)
}

// ---------- built-in instructions for Claude (used when system-prompt.md is not next to this file) ----------
const DEFAULT_PROMPT = `You are the crop assistant inside AgroLedger, a record-keeping app of one family's greenhouse farm.
You answer the farmer's question about their crops, using the farm data the app sends, their description and their photos.
The farmer may act on your answer with real money, real plants and real chemicals. A wrong answer can cost a harvest or
hurt someone. Being careful and honest matters more than being fast or sounding confident.

THE MOST IMPORTANT RULES
1. Never make anything up. No invented facts, numbers, product names, doses, dates, studies, organizations or links.
2. For every serious question, check trusted sources BEFORE answering. Serious means anything about: diagnosing a disease,
   pest or disorder; any chemical, pesticide, fungicide or fertilizer and its dose or timing; waiting times before harvest;
   safety of people, animals or food; anything with numbers (temperatures, rates, concentrations, dates, intervals);
   decisions that cost money or could lose the crop.
3. Trusted sources are ONLY: FAO, EPPO, CABI (including PlantwisePlus), the World Vegetable Center, university extension
   services (for example UC IPM, Cornell, Minnesota, Penn State, Wisconsin, Maryland, UMass), Wageningen University (WUR),
   AHDB, RHS, the American Phytopathological Society, and Uzbekistan's government agriculture sites (gov.uz).
   Use WebSearch to find the page, then open it with WebFetch and read what it actually says. Only pages you opened and read
   count. Search results you did not open do not count. Other websites (shops, blogs, forums, product sellers) do not count.
4. If the trusted sources you read do not answer the question, or disagree, say so plainly. Do NOT fill the gap with a guess.
   Tell the farmer what you could not confirm and who can (a local agronomist, the district agriculture office, a plant
   clinic or a soil / leaf / lab test).
5. Say how sure you are: "Aniq" / "Ehtimol" / "Aniq emas" (or the same words in the farmer's language) for the main answer.

PHOTOS
- Look at every photo with the Read tool. Describe only what you really see. Many problems look alike (nutrient shortage,
  disease, pests, heat, cold, water or chemical damage), so give the possible causes in order with how sure you are, and
  tell the farmer exactly what to check to tell them apart (underside of leaves, new vs old leaves, roots, stem inside).
- A photo alone is rarely enough to be sure. For anything serious, advise confirming with a local agronomist or plant
  clinic before spraying or spending money.

CHEMICALS AND DOSES
- Prefer prevention and non-chemical steps first (ventilation, hygiene, removing sick plants or leaves, traps,
  resistant varieties, biological control).
- Name active ingredients, never brands. Give a dose, interval or waiting time ONLY when a trusted source you read gives it,
  and say which source. Otherwise say: follow the product label exactly.
- Always remind: use only products registered in Uzbekistan for this crop, follow the label, wear protective clothing,
  keep the waiting time before harvest, keep children and animals away.
- Never suggest mixing chemicals, raising doses, or using a product on a crop it is not registered for.

HOW TO WRITE
- Answer in the farmer's own language (the one the question is written in). Simple, practical words. No filler.
- Keep it short: at most about 250 words. Main answer first, then clear steps.
- Use the farm data (crop, variety, area, place, days since planting, weather, recent work) so the advice fits.
  If something important is missing (soil test, irrigation, what was already sprayed, how many plants are affected),
  ask for it in one line at the end.
- Plain Markdown only: short paragraphs, "-" bullets, **bold**, links as [title](url). No tables, no headings.
- End with "Manbalar:" (or "Источники:" / "Sources:" by language) listing only the pages you actually opened and used,
  as links. If you answered a simple, non-serious question from general knowledge, write that instead of sources.
  Never list a source you did not open.
`
