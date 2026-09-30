#!/usr/bin/env node
/**
 * AgroLedger AI helper — connects the website to Claude on YOUR computer.
 *
 * The website (in your browser) sends the crop's records, the weather and your question here.
 * This helper passes them to the Claude Code CLI (`claude -p`), which answers with your own
 * Claude login. Nothing is sent anywhere else, and every request is printed below so you can
 * check exactly what was asked and what came back.
 *
 * Start:   node ai-helper.mjs
 * Needs:   Node.js 20+ and Claude Code (https://claude.com/claude-code), signed in once with `claude`.
 *
 * Options (environment variables):
 *   AGRO_AI_PORT=8787          port to listen on (only on this computer, 127.0.0.1)
 *   AGRO_AI_MODEL=sonnet       Claude model to use (default: what your Claude Code uses)
 *   AGRO_AI_ORIGINS=https://…  extra website addresses allowed to talk to this helper (comma separated)
 *   AGRO_AI_LOG=0              don't save the last question/answer to files
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const VERSION = 1
const PORT = Number(process.env.AGRO_AI_PORT || 8787)
const MODEL = process.env.AGRO_AI_MODEL || ''
const LOG_FILES = process.env.AGRO_AI_LOG !== '0'
const TIMEOUT_MS = 4 * 60 * 1000
const MAX_BODY = 12 * 1024 * 1024
const CLAUDE = process.platform === 'win32' ? 'claude.cmd' : 'claude'

const HOME = join(homedir(), '.agroledger')
const WORK = join(HOME, 'work') // Claude runs here, never inside your own folders
const PHOTOS = join(WORK, 'photos')
mkdirSync(PHOTOS, { recursive: true })

// ---------- pairing code: the website must send it, so other sites can't use your Claude ----------
const CONFIG = join(HOME, 'helper.json')
let config = {}
try {
  config = JSON.parse(readFileSync(CONFIG, 'utf8'))
} catch {
  // first start
}
if (!config.code) {
  config.code = randomBytes(4).toString('hex').toUpperCase().replace(/(.{4})/, '$1-')
  writeFileSync(CONFIG, JSON.stringify(config, null, 2))
}
const CODE = config.code

const ORIGINS = [
  'https://agroledger-app.github.io',
  ...(process.env.AGRO_AI_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
]
function originAllowed(o) {
  if (!o) return false
  if (ORIGINS.includes(o)) return true
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) // the app running on this computer (npm run dev)
}

// ---------- what Claude is told ----------
const LANG_NAME = { uz: 'Uzbek (Latin script, O‘zbekcha)', ru: 'Russian', en: 'English' }

function systemPrompt(lang, webSearch) {
  return [
    'You are "AI yordamchi", the assistant inside AgroLedger, a record-keeping app for a family greenhouse farm in Uzbekistan (film/plastic greenhouses).',
    'The user message contains a JSON block with everything the family has entered for one crop: crop, variety, area in hectares, planting date and day number, the place, the weather forecast and the app\'s rule-based weather alerts, expenses (fertilisers, chemicals, seedlings…), harvest per day, worker days, trucks, sales, income and give & take. Use these details; do not ask for things that are already there. If something important is missing (e.g. no planting date or area), say so briefly and give advice that works anyway.',
    `Always answer in ${LANG_NAME[lang] || 'English'}. Use simple words a farmer and a worker understand. Be short and practical.`,
    'Doses: give them per 1 ha AND as the total for this crop\'s area (and water in m³ when it is fertigation or spraying), so nobody has to calculate in the greenhouse.',
    'Safety: for any pesticide or strong fertiliser say to check the product label and the waiting days before harvest; never invent a product registration. Prefer the products the family already bought (see expenses) when they fit.',
    'Take the weather and alerts into account (frost, heat, wind, rain, disease risk from damp hours).',
    webSearch
      ? 'You may search the internet when it really helps (e.g. a pest, a product label); name your sources.'
      : 'Do not use the internet. Name the kind of source your advice is based on (e.g. FAO greenhouse tomato guide) when relevant.',
    'Never make up records or numbers that are not in the data; when you use a number from the records, it must match.',
  ].join('\n')
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    stage: { type: 'string', description: 'Growth stage today in a few words, without the day number, e.g. "Flowering and fruit set"' },
    summary: { type: 'string', description: 'One short sentence: the most important thing today' },
    jobs: {
      type: 'array',
      description: '3 to 6 jobs for today, most important first',
      items: {
        type: 'object',
        properties: {
          icon: { type: 'string', description: 'One emoji, e.g. 🧪 feeding, 💧 watering, ✂️ leaves, 🐝 pollination, 🛡 protection, 🌡 climate, 🧺 harvest' },
          title: { type: 'string', description: 'The job in a few words' },
          detail: { type: 'string', description: 'How to do it, one or two sentences' },
          why: { type: 'string', description: 'Why, one short sentence' },
          doses: {
            type: 'array',
            description: 'Only for feeding/spraying: each product or water with amount per 1 ha and total for the crop area',
            items: {
              type: 'object',
              properties: {
                product: { type: 'string' },
                perHa: { type: 'number' },
                total: { type: 'number' },
                unit: { type: 'string', description: 'kg, l, g, ml or m³' },
              },
              required: ['product', 'perHa', 'total', 'unit'],
            },
          },
        },
        required: ['icon', 'title', 'detail', 'why'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Weather or disease warnings with what to do (may be empty)' },
    sources: { type: 'array', items: { type: 'string' }, description: 'Sources used, short names (with URL if from the internet)' },
    missing: { type: 'string', description: 'What data is missing that would make the advice better (empty if nothing)' },
  },
  required: ['stage', 'summary', 'jobs', 'warnings', 'sources'],
}

function contextBlock(context) {
  return '<farm_data>\n' + JSON.stringify(context, null, 1) + '\n</farm_data>'
}

function buildPrompt(req, photoPath) {
  const parts = [contextBlock(req.context)]
  if (req.kind === 'plan') {
    parts.push(
      `Make today's work plan (${req.context?.today ?? 'today'}) for this crop in the greenhouse. ` +
        'Think about the day since planting and the growth stage, the weather of today and the next days, and what was done recently (expenses, harvest). ' +
        'Keep each job to one line in the title; details go in "detail".',
    )
  } else {
    const history = (req.messages || []).slice(-12)
    if (history.length) {
      parts.push(
        '<earlier_conversation>\n' +
          history.map((m) => `${m.role === 'user' ? 'Farmer' : 'You'}: ${String(m.text).slice(0, 4000)}`).join('\n\n') +
          '\n</earlier_conversation>',
      )
    }
    if (photoPath) parts.push(`The farmer attached a photo. Open and look at it first with the Read tool: ${photoPath}`)
    parts.push(`Farmer's question:\n${String(req.question || '').slice(0, 8000)}`)
    parts.push('Answer briefly. Use short lines or a few bullet points; no big headings.')
  }
  return parts.join('\n\n')
}

// ---------- running claude ----------
let running = 0

function runClaude(prompt, { lang, webSearch, schema, photo }) {
  const tools = []
  if (photo) tools.push('Read')
  if (webSearch) tools.push('WebSearch', 'WebFetch')
  const args = [
    '-p',
    '--output-format', 'json',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--tools', tools.join(','),
    '--append-system-prompt', systemPrompt(lang, webSearch),
  ]
  if (tools.length) args.push('--allowedTools', tools.join(','))
  if (photo) args.push('--add-dir', PHOTOS)
  if (schema) args.push('--json-schema', JSON.stringify(schema))
  if (MODEL) args.push('--model', MODEL)

  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE, args, { cwd: WORK, shell: process.platform === 'win32', env: process.env })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Claude took too long (over 4 minutes).'))
    }, TIMEOUT_MS)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(e.code === 'ENOENT' ? 'The `claude` command was not found. Install Claude Code and sign in with `claude` once.' : e.message))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      let data
      try {
        data = JSON.parse(out)
      } catch {
        return reject(new Error((err || out || `claude exited with code ${code}`).trim().slice(0, 600)))
      }
      if (data.is_error) return reject(new Error(String(data.result || data.subtype || 'Claude returned an error').slice(0, 600)))
      resolve(data)
    })
    child.stdin.end(prompt)
  })
}

async function claudeVersion() {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE, ['--version'], { shell: process.platform === 'win32' })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('error', () => resolve(null))
    child.on('close', () => resolve(out.trim() || null))
  })
}

// ---------- http ----------
function send(res, status, body, origin) {
  const headers = { 'content-type': 'application/json; charset=utf-8', vary: 'Origin' }
  if (originAllowed(origin)) headers['access-control-allow-origin'] = origin
  res.writeHead(status, headers)
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('Too big (photo over ~8 MB?)'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function savePhoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '')
  if (!m) return null
  const file = join(PHOTOS, `${randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`)
  writeFileSync(file, Buffer.from(m[2], 'base64'))
  return file
}

const time = () => new Date().toLocaleTimeString()

let claudeVer = null

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin)) return send(res, 403, { error: 'This website is not allowed.' })
    res.writeHead(204, {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-agro-code',
      'access-control-allow-private-network': 'true',
      'access-control-max-age': '600',
      vary: 'Origin',
    })
    return res.end()
  }
  if (origin && !originAllowed(origin)) return send(res, 403, { error: 'This website is not allowed.' })
  const paired = req.headers['x-agro-code'] === CODE

  if (req.method === 'GET' && req.url === '/status') {
    return send(res, 200, { ok: true, app: 'agroledger-ai-helper', version: VERSION, paired, claude: paired ? claudeVer : undefined }, origin)
  }

  if (req.method === 'POST' && req.url === '/ask') {
    if (!paired) return send(res, 401, { error: 'Wrong pairing code.' }, origin)
    if (running >= 2) return send(res, 429, { error: 'Busy with two questions already; try again in a minute.' }, origin)
    let photo = null
    running++
    try {
      const body = JSON.parse(await readBody(req))
      const kind = body.kind === 'plan' ? 'plan' : 'chat'
      photo = kind === 'chat' ? savePhoto(body.photo) : null
      const prompt = buildPrompt({ ...body, kind }, photo)
      const crop = body.context?.crop
      console.log(`\n[${time()}] ${kind === 'plan' ? "Today's plan" : 'Question'} · ${crop?.name ?? ''} ${crop?.variety ?? ''}${photo ? ' · with photo' : ''}${body.webSearch ? ' · internet on' : ''}`)
      if (kind === 'chat') console.log('  Q:', String(body.question || '').slice(0, 300))
      if (LOG_FILES) writeFileSync(join(HOME, 'last-prompt.txt'), prompt)

      const started = Date.now()
      const data = await runClaude(prompt, { lang: body.lang, webSearch: !!body.webSearch, schema: kind === 'plan' ? PLAN_SCHEMA : null, photo })
      const secs = Math.round((Date.now() - started) / 1000)
      const answer = kind === 'plan' ? data.structured_output ?? safeJson(data.result) : data.result
      if (LOG_FILES) writeFileSync(join(HOME, 'last-answer.json'), JSON.stringify({ at: new Date().toISOString(), kind, answer, cost_usd: data.total_cost_usd }, null, 2))
      console.log(`  ✓ answered in ${secs}s${typeof data.total_cost_usd === 'number' ? ` · ~$${data.total_cost_usd.toFixed(3)} of usage` : ''}`)
      if (kind === 'chat') console.log('  A:', String(answer).slice(0, 300).replace(/\n/g, '\n     '))
      if (!answer) throw new Error('Claude gave an empty answer.')
      send(res, 200, { answer, seconds: secs }, origin)
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
      send(res, 500, { error: e.message }, origin)
    } finally {
      running--
      if (photo && existsSync(photo)) rmSync(photo)
    }
    return
  }
  send(res, 404, { error: 'Not found' }, origin)
})

function safeJson(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy — is the helper already running? Or start with AGRO_AI_PORT=8788.`)
  else console.error(e)
  process.exit(1)
})

claudeVer = await claudeVersion()
server.listen(PORT, '127.0.0.1', () => {
  console.log('')
  console.log('  AgroLedger AI helper is running')
  console.log(`  Address:       http://127.0.0.1:${PORT}`)
  console.log(`  Pairing code:  ${CODE}   (type it in AgroLedger → Settings → AI assistant)`)
  console.log(`  Claude Code:   ${claudeVer ?? 'NOT FOUND — install it and run `claude` once to sign in'}`)
  console.log(`  Model:         ${MODEL || 'your Claude Code default'}`)
  if (LOG_FILES) console.log(`  Last question and answer are saved in ${HOME}`)
  console.log('  Keep this window open while you use the AI. Press Ctrl+C to stop.')
})
