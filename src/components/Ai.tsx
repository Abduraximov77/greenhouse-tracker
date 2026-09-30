import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { setAi, useDB, type SeasonCrop } from '../lib/store'
import { useT } from '../lib/i18n'
import { href } from '../lib/router'
import { formatDate, formatNumber, todayISO } from '../lib/format'
import { cropName } from '../lib/crops'
import { cropPlace, dayOfCrop, useForecast } from '../lib/weather'
import {
  addChat,
  addJobToday,
  aiSettings,
  askChat,
  askPlan,
  buildContext,
  clearChat,
  HelperError,
  helperStatus,
  savePlan,
  toggleJob,
  useCropAi,
  type HelperStatus,
  type PlanJob,
  type SavedPlan,
} from '../lib/ai'
import { PlaceWeather } from './Weather'

// ---------- which crops are waiting for Claude right now (shared by the card and the AI section) ----------

const busy = new Map<string, 'plan' | 'chat'>()
const busyListeners = new Set<() => void>()
let busyVersion = 0
function setBusy(key: string, v: 'plan' | 'chat' | null) {
  if (v) busy.set(key, v)
  else busy.delete(key)
  busyVersion++
  busyListeners.forEach((l) => l())
}
function useBusy(key: string, kind: 'plan' | 'chat') {
  useSyncExternalStore(
    (l) => {
      busyListeners.add(l)
      return () => busyListeners.delete(l)
    },
    () => busyVersion,
  )
  return busy.get(key) === kind
}

// Plans tried automatically in this visit (so a failed try isn't repeated on every page change).
const autoTried = new Set<string>()
const planErrors = new Map<string, HelperError>()

function useErrorText() {
  const t = useT()
  return (e: unknown) => {
    const kind = e instanceof HelperError ? e.kind : 'claude'
    if (kind === 'offline') return t('Can’t reach the AI helper on this computer. Start it with “node ai-helper.mjs” and keep its window open.')
    if (kind === 'code') return t('The pairing code is wrong. Copy it from the helper window into Settings → AI assistant.')
    if (kind === 'busy') return t('The helper is busy with other questions. Try again in a minute.')
    return t('Claude could not answer: {msg}', { msg: e instanceof Error ? e.message : String(e) })
  }
}

/** Make today's plan for a crop (runs in the background; the card and the AI section both show it). */
function usePlanMaker(crop: SeasonCrop) {
  const db = useDB()
  const s = aiSettings(db)
  const place = cropPlace(db, crop)
  const { data: forecast, loading } = useForecast(place)
  const running = useBusy(crop.id, 'plan')
  const [, rerender] = useState(0)
  async function make() {
    if (busy.get(crop.id)) return
    setBusy(crop.id, 'plan')
    planErrors.delete(crop.id)
    try {
      const plan = await askPlan(s, db.settings.lang, buildContext(db, crop, forecast))
      savePlan(crop.id, { date: todayISO(), lang: db.settings.lang, madeAt: new Date().toISOString(), plan, done: [] })
    } catch (e) {
      planErrors.set(crop.id, e instanceof HelperError ? e : new HelperError(String(e), 'claude'))
    } finally {
      setBusy(crop.id, null)
      rerender((n) => n + 1)
    }
  }
  return { make, running, error: planErrors.get(crop.id) ?? null, ready: !!s.code.trim(), forecastReady: !place || !!forecast || !loading }
}

// ---------- Overview: today's jobs card ----------

export function AiTodayCard({ crop, seasonId }: { crop: SeasonCrop; seasonId: string }) {
  const db = useDB()
  const t = useT()
  const s = aiSettings(db)
  const ai = useCropAi(crop.id)
  const today = todayISO()
  const saved = ai.plans[today]
  const { make, running, error, ready, forecastReady } = usePlanMaker(crop)
  const errorText = useErrorText()
  const detailsHref = href('season', seasonId, 'crop', crop.id, 'ai')

  // Once a day, make the plan by itself when the crop is opened.
  useEffect(() => {
    const key = `${crop.id}|${today}`
    if (s.autoPlan && ready && forecastReady && !saved && !autoTried.has(key)) {
      autoTried.add(key)
      void make()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop.id, today, s.autoPlan, ready, forecastReady, !!saved])

  if (!ready) {
    return (
      <div className="card ai-card ai-card-setup">
        <span className="ai-spark" aria-hidden="true">
          ✨
        </span>
        <div>
          <p className="ai-title">{t('AI assistant')}</p>
          <p className="field-hint">{t('Connect Claude on your computer to get today’s jobs for this crop, with doses worked out for your area.')}</p>
        </div>
        <a className="btn btn-primary btn-small" href={href('settings', 'ai')}>
          {t('Set up')}
        </a>
      </div>
    )
  }

  return (
    <section className="card ai-card" aria-label={t('Today’s jobs')}>
      <div className="ai-card-head">
        <p className="ai-title">
          <span aria-hidden="true">✨</span> {t('Today’s jobs')}
          <DayStage crop={crop} stage={saved?.plan.stage} />
        </p>
        {saved && (
          <a className="wx-place-link" href={detailsHref}>
            {t('Details')} →
          </a>
        )}
      </div>
      {saved && saved.plan.jobs.length > 0 ? (
        <JobList cropId={crop.id} saved={saved} area={crop.areaHa} compact />
      ) : running ? (
        <Thinking text={t('Claude is making today’s plan… (about half a minute)')} />
      ) : (
        <div className="ai-empty">
          {error && <p className="form-error">{errorText(error)}</p>}
          <button className="btn btn-primary btn-small" onClick={() => void make()}>
            {error ? t('Try again') : t('Make today’s plan')}
          </button>
        </div>
      )}
    </section>
  )
}

function DayStage({ crop, stage, lead = true }: { crop: SeasonCrop; stage?: string; lead?: boolean }) {
  const t = useT()
  const day = crop.plantedAt ? dayOfCrop(crop.plantedAt) : null
  const bits = [day && day > 0 ? t('Day {n}', { n: day }) : '', stage ?? ''].filter(Boolean)
  return bits.length ? <span className="ai-sub">{lead ? ' · ' : ''}{bits.join(' · ')}</span> : null
}

function doseLine(job: PlanJob, area: number | null) {
  if (!job.doses?.length) return ''
  return job.doses.map((d) => `${d.product} ${formatNumber(area ? d.total : d.perHa)} ${d.unit}`).join(' + ')
}

function JobList({ cropId, saved, area, compact }: { cropId: string; saved: SavedPlan; area: number | null; compact?: boolean }) {
  const t = useT()
  return (
    <ul className="ai-jobs">
      {saved.plan.jobs.map((job, i) => {
        const done = saved.done.includes(i)
        const dose = doseLine(job, area)
        return (
          <li key={i} className={`ai-job${done ? ' is-done' : ''}`}>
            <label className="ai-job-row">
              <input type="checkbox" checked={done} onChange={() => toggleJob(cropId, saved.date, i)} />
              <span className="ai-job-icon" aria-hidden="true">
                {job.icon}
              </span>
              <span className="ai-job-text">
                <b>{job.title}</b>
                {compact && dose && (
                  <span className="ai-job-dose">
                    {dose}
                    {area ? ` (${formatNumber(area)} ${t('ha')})` : ` / ${t('ha')}`}
                  </span>
                )}
              </span>
            </label>
            {!compact && <JobDetail job={job} area={area} />}
          </li>
        )
      })}
    </ul>
  )
}

function JobDetail({ job, area }: { job: PlanJob; area: number | null }) {
  const t = useT()
  return (
    <div className="ai-job-detail">
      {job.detail && <p>{job.detail}</p>}
      {!!job.doses?.length && (
        <div className="table-wrap">
          <table className="table ai-doses">
            <thead>
              <tr>
                <th>{t('Product')}</th>
                <th className="num">1 {t('ha')}</th>
                <th className="num">{area ? `${formatNumber(area)} ${t('ha')}` : t('Total')}</th>
              </tr>
            </thead>
            <tbody>
              {job.doses.map((d, i) => (
                <tr key={i}>
                  <td>{d.product}</td>
                  <td className="num">
                    {formatNumber(d.perHa)} {d.unit}
                  </td>
                  <td className="num">
                    <b>
                      {formatNumber(d.total)} {d.unit}
                    </b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {job.why && (
        <p className="ai-why">
          {t('Why')}: {job.why}
        </p>
      )}
    </div>
  )
}

function Thinking({ text }: { text: string }) {
  return (
    <p className="ai-thinking" role="status">
      <span className="ai-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>{' '}
      {text}
    </p>
  )
}

// ---------- the AI section of a crop ----------

type AiTab = 'plan' | 'ask' | 'weather'

export function AiSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const [tab, setTab] = useState<AiTab>('plan')
  const s = aiSettings(db)
  return (
    <>
      <HelperBadge />
      <div className="segmented ai-tabs" role="tablist">
        {(
          [
            ['plan', t('Today’s jobs')],
            ['ask', t('Ask')],
            ['weather', t('Weather')],
          ] as [AiTab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {!s.code.trim() && tab !== 'weather' ? (
        <div className="card ai-card ai-card-setup">
          <span className="ai-spark" aria-hidden="true">
            ✨
          </span>
          <div>
            <p className="ai-title">{t('Connect Claude first')}</p>
            <p className="field-hint">{t('Start the AI helper on your computer and type its pairing code in Settings.')}</p>
          </div>
          <a className="btn btn-primary btn-small" href={href('settings', 'ai')}>
            {t('Set up')}
          </a>
        </div>
      ) : tab === 'plan' ? (
        <PlanView crop={crop} />
      ) : tab === 'ask' ? (
        <ChatView crop={crop} />
      ) : (
        <CropWeather crop={crop} />
      )}
    </>
  )
}

function PlanView({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const ai = useCropAi(crop.id)
  const today = todayISO()
  const saved = ai.plans[today]
  const { make, running, error } = usePlanMaker(crop)
  const errorText = useErrorText()
  const name = cropName(crop.crop, db.settings.lang)

  return (
    <div className="card ai-plan">
      <div className="ai-card-head">
        <div>
          <p className="ai-title ai-plan-title">
            <DayStage crop={crop} stage={saved?.plan.stage} lead={false} />
          </p>
          <p className="field-hint">
            {[name, crop.variety, crop.areaHa ? `${formatNumber(crop.areaHa)} ${t('ha')}` : '', formatDate(today)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button className="btn btn-ghost btn-small" onClick={() => void make()} disabled={running}>
          {saved ? t('Make again') : t('Make today’s plan')}
        </button>
      </div>

      {running && <Thinking text={t('Claude is making today’s plan… (about half a minute)')} />}
      {error && !running && <p className="form-error">{errorText(error)}</p>}

      {saved ? (
        <>
          {saved.plan.summary && <p className="ai-summary">{saved.plan.summary}</p>}
          {saved.plan.warnings.length > 0 && (
            <ul className="wx-warnings">
              {saved.plan.warnings.map((w, i) => (
                <li key={i} className="wx-warning wx-warn">
                  <span>⚠ {w}</span>
                </li>
              ))}
            </ul>
          )}
          <JobList cropId={crop.id} saved={saved} area={crop.areaHa} />
          {saved.plan.missing && <p className="field-hint">ℹ {saved.plan.missing}</p>}
          {saved.plan.sources.length > 0 && (
            <p className="field-hint">
              {t('Sources')}: {saved.plan.sources.join(' · ')}
            </p>
          )}
          <p className="ai-safety">⚠ {t('This is advice. Check doses of fertilisers and chemicals on the label and with an agronomist.')}</p>
          <p className="field-hint">{t('Made at {time} by Claude.', { time: new Date(saved.madeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</p>
        </>
      ) : (
        !running &&
        !error && <p className="field-hint">{t('Claude looks at this crop’s records, its day since planting and the weather, and suggests today’s jobs.')}</p>
      )}
    </div>
  )
}

// ---------- chat ----------

/** Shrink a photo: a larger copy for Claude, a small one to keep in the chat. */
async function shrink(file: File, max: number, quality = 0.85): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function ChatView({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const s = aiSettings(db)
  const ai = useCropAi(crop.id)
  const { data: forecast } = useForecast(cropPlace(db, crop))
  const running = useBusy(`${crop.id}|chat`, 'chat')
  const errorText = useErrorText()
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<{ big: string; small: string } | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [ai.chat.length, running])

  async function send(q: string) {
    const question = q.trim()
    if ((!question && !photo) || running) return
    const history = ai.chat
    const pic = photo
    addChat(crop.id, { id: crypto.randomUUID(), role: 'user', text: question || t('What is this?'), photo: pic?.small, at: new Date().toISOString() })
    setText('')
    setPhoto(null)
    setBusy(`${crop.id}|chat`, 'chat')
    try {
      const answer = await askChat(s, db.settings.lang, buildContext(db, crop, forecast), question || t('What is this?'), history, pic?.big)
      addChat(crop.id, { id: crypto.randomUUID(), role: 'ai', text: answer, at: new Date().toISOString() })
    } catch (e) {
      addChat(crop.id, { id: crypto.randomUUID(), role: 'ai', text: errorText(e), at: new Date().toISOString(), error: true })
    } finally {
      setBusy(`${crop.id}|chat`, null)
    }
  }

  function addAsJob(m: { id: string; text: string }) {
    const lines = m.text.split('\n').map((l) => l.replace(/^[\s*#>-]+|\*\*/g, '').trim()).filter(Boolean)
    const title = (lines[0] ?? '').slice(0, 90)
    addJobToday(crop.id, { icon: '📝', title, detail: lines.slice(1).join(' ').slice(0, 600), why: '' }, db.settings.lang)
    setAdded([...added, m.id])
  }

  const quick = [t('What should I do today?'), t('Leaves are turning yellow'), t('How much fertiliser to give?'), t('Is the weather dangerous this week?')]

  return (
    <div className="card ai-chat">
      <div className="ai-msgs" aria-live="polite">
        {ai.chat.length === 0 && (
          <p className="field-hint">{t('Ask in any language, and add a photo of a leaf or fruit. Claude already knows this crop, its day, area, records and weather.')}</p>
        )}
        {ai.chat.map((m) => (
          <div key={m.id} className={`ai-msg ai-msg-${m.role}${m.error ? ' ai-msg-error' : ''}`}>
            {m.photo && <img className="ai-msg-photo" src={m.photo} alt={t('Photo')} />}
            <Rich text={m.text} />
            {m.role === 'ai' && !m.error && (
              <div className="ai-msg-actions">
                <button type="button" className="link-btn" disabled={added.includes(m.id)} onClick={() => addAsJob(m)}>
                  {added.includes(m.id) ? `✓ ${t('Added to today’s jobs')}` : `+ ${t('Add to today’s jobs')}`}
                </button>
              </div>
            )}
          </div>
        ))}
        {running && <Thinking text={t('Claude is thinking…')} />}
        <div ref={endRef} />
      </div>

      <div className="ai-quick">
        {quick.map((q) => (
          <button key={q} type="button" className="btn btn-ghost btn-small" disabled={running} onClick={() => void send(q)}>
            {q}
          </button>
        ))}
      </div>

      {photo && (
        <div className="ai-attached">
          <img src={photo.small} alt={t('Photo')} />
          <button type="button" className="link-btn" onClick={() => setPhoto(null)}>
            {t('Remove')}
          </button>
        </div>
      )}
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault()
          void send(text)
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) setPhoto({ big: await shrink(f, 1400), small: await shrink(f, 360, 0.7) })
          }}
        />
        <button type="button" className="btn btn-ghost btn-icon" aria-label={t('Add a photo')} onClick={() => fileRef.current?.click()}>
          📷
        </button>
        <textarea
          className="input"
          rows={1}
          placeholder={t('Type a question…')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(text)
            }
          }}
        />
        <button type="submit" className="btn btn-primary btn-icon" aria-label={t('Send')} disabled={running || (!text.trim() && !photo)}>
          ➤
        </button>
      </form>
      {ai.chat.length > 0 && (
        <button type="button" className="link-btn ai-clear" onClick={() => clearChat(crop.id)}>
          {t('Clear the chat')}
        </button>
      )}
    </div>
  )
}

/** Claude's answers use a little Markdown: **bold**, bullet lines and headings. Shown simply, without HTML. */
function Rich({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part))
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length}>
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = /^([-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (bullet) {
      list.push(bullet[2])
      continue
    }
    flush()
    if (!line) continue
    const h = /^#{1,6}\s+(.*)$/.exec(line)
    blocks.push(<p key={blocks.length}>{h ? <b>{inline(h[1])}</b> : inline(line)}</p>)
  }
  flush()
  return <div className="ai-rich">{blocks}</div>
}

function CropWeather({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const place = cropPlace(db, crop)
  if (!place) {
    return (
      <div className="card wx-card wx-empty">
        <p className="field-hint">{t('Set where this crop grows to see its weather.')}</p>
        <a className="btn btn-primary btn-small" href={href('settings', 'location')}>
          {t('Set location')}
        </a>
      </div>
    )
  }
  return (
    <section className="card wx-card">
      <PlaceWeather place={place} crops={[cropName(crop.crop, db.settings.lang)]} />
    </section>
  )
}

// ---------- connection ----------

function useHelperStatus(poll = false) {
  const db = useDB()
  const s = aiSettings(db)
  const [st, setSt] = useState<{ state: 'checking' | 'ok' | 'code' | 'offline'; info?: HelperStatus }>({ state: 'checking' })
  const check = async () => {
    setSt({ state: 'checking' })
    try {
      const info = await helperStatus(s)
      setSt({ state: info.paired ? 'ok' : 'code', info })
    } catch {
      setSt({ state: 'offline' })
    }
  }
  useEffect(() => {
    if (!s.code.trim() && !poll) return
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.url, s.code])
  return { ...st, check }
}

function HelperBadge() {
  const t = useT()
  const db = useDB()
  const st = useHelperStatus()
  if (!aiSettings(db).code.trim()) return null
  return (
    <p className={`ai-badge ai-badge-${st.state}`}>
      <span className="ai-badge-dot" aria-hidden="true" />{' '}
      {st.state === 'ok'
        ? t('Claude is connected')
        : st.state === 'checking'
          ? t('Checking the AI helper…')
          : st.state === 'code'
            ? t('Wrong pairing code')
            : t('AI helper is not running')}{' '}
      {st.state !== 'ok' && (
        <a className="wx-place-link" href={href('settings', 'ai')}>
          {t('Settings')}
        </a>
      )}
    </p>
  )
}

export function AiSettingsCard() {
  const db = useDB()
  const t = useT()
  const s = aiSettings(db)
  const st = useHelperStatus(true)
  const [code, setCode] = useState(s.code)
  const [url, setUrl] = useState(s.url)
  const helperFile = `${import.meta.env.BASE_URL}ai-helper.mjs`

  return (
    <div className="card settings-card ai-settings" id="ai">
      <ol className="ai-steps">
        <li>
          {t('Install Claude Code on this computer and sign in once by typing')} <code>claude</code>.
        </li>
        <li>
          <a href={helperFile} download="ai-helper.mjs">
            {t('Download the AI helper')}
          </a>{' '}
          {t('and start it in a terminal:')} <code>node ai-helper.mjs</code>
        </li>
        <li>{t('Type the pairing code it shows here and press Connect.')}</li>
      </ol>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          setAi({ code: code.trim().toUpperCase(), url: url.trim() || s.url })
          void st.check()
        }}
      >
        <label className="field">
          <span className="field-label">{t('Pairing code')}</span>
          <input className="input" value={code} placeholder="ABCD-1234" autoComplete="off" onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('Helper address')}</span>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div className="field form-actions-start ai-connect">
          <button type="submit" className="btn btn-primary">
            {t('Connect')}
          </button>
        </div>
      </form>
      <p className={`ai-badge ai-badge-${st.state}`} role="status">
        <span className="ai-badge-dot" aria-hidden="true" />{' '}
        {st.state === 'ok'
          ? t('Connected · {v}', { v: st.info?.claude ?? 'Claude Code' })
          : st.state === 'checking'
            ? t('Checking the AI helper…')
            : st.state === 'code'
              ? t('The helper is running, but the pairing code is wrong.')
              : t('The AI helper is not running on this computer.')}
      </p>

      <div className="ai-toggles">
        <label className="ai-toggle">
          <input type="checkbox" checked={s.autoPlan} onChange={(e) => setAi({ autoPlan: e.target.checked })} />
          <span>
            <b>{t('Make today’s plan by itself')}</b>
            <span className="field-hint">{t('When you open a crop, once a day.')}</span>
          </span>
        </label>
        <label className="ai-toggle">
          <input type="checkbox" checked={s.webSearch} onChange={(e) => setAi({ webSearch: e.target.checked })} />
          <span>
            <b>{t('Let Claude search the internet')}</b>
            <span className="field-hint">{t('For pests and product labels. Answers take longer.')}</span>
          </span>
        </label>
      </div>
      <p className="field-hint">
        {t('Answers come in the app’s language. Claude gets this crop’s records and weather; worker names, drivers and phone numbers are not sent.')}{' '}
        {t('The helper window shows every question and answer, so you can check them. Works in Chrome, Edge and Firefox; if the browser asks to reach devices on your network, allow it.')}
      </p>
    </div>
  )
}
