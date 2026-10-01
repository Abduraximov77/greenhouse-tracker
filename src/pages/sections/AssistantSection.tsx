import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { addRecord, byDateDesc, removeRecord, useDB, type Answer, type SeasonCrop } from '../../lib/store'
import { useT } from '../../lib/i18n'
import { href } from '../../lib/router'
import { formatDateTime } from '../../lib/format'
import {
  askHelper,
  cropContext,
  helperHealth,
  shrinkPhoto,
  useHelperLink,
  type HelperHealth,
  type HelperLink,
  type JobState,
} from '../../lib/assistant'
import { DeleteButton, Empty } from '../../components/ui'
import { refreshMe, requestAssistant, useCloud } from '../../lib/cloud'
import { Markdown } from '../../components/Markdown'

// Questions still being answered, kept outside the page so leaving and coming back doesn't lose them.
type Pending = { question: string; photos: number; state: JobState | null; started: number; error?: string }
const pending = new Map<string, Pending>()
const pendingListeners = new Set<() => void>()
let pendingVersion = 0
const bump = () => {
  pendingVersion++
  pendingListeners.forEach((f) => f())
}
function usePending(cropId: string) {
  useSyncExternalStore(
    (f) => {
      pendingListeners.add(f)
      return () => pendingListeners.delete(f)
    },
    () => pendingVersion,
  )
  return pending.get(cropId) ?? null
}

type Photo = { type: string; data: string; preview: string }

/** Ask the AI assistant about this crop, with photos. Each question is a separate, independent run. */
export function AssistantSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const link = useHelperLink()
  const answers = db.answers.filter((a) => a.cropId === crop.id).sort(byDateDesc((a) => a.createdAt))
  const busy = usePending(crop.id)

  const [question, setQuestion] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [followUp, setFollowUp] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showContext, setShowContext] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const health = useHealth(link)

  if (!link) return <NotLinked />

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const room = 4 - photos.length
    const picked = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room)
    try {
      const shrunk = await Promise.all(picked.map(shrinkPhoto))
      setPhotos((p) => [...p, ...shrunk].slice(0, 4))
    } catch {
      setError(t('This photo could not be read. Try another one.'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function send() {
    if (!link) return
    const q = question.trim()
    if (!q) return setError(t('Write your question first.'))
    setError(null)
    const context = cropContext(db, crop)
    const sent = { photos: photos.length, followUpOf: followUp?.id ?? null }
    pending.set(crop.id, { question: q, photos: photos.length, state: null, started: Date.now() })
    bump()
    const input = {
      question: q,
      context,
      lang: db.settings.lang,
      images: photos.map(({ type, data }) => ({ type, data })),
      previous: followUp ? `Q: ${followUp.question}\nA: ${followUp.answer}` : undefined,
    }
    setQuestion('')
    setPhotos([])
    setFollowUp(null)
    try {
      const res = await askHelper(link, input, (state) => {
        const p = pending.get(crop.id)
        if (p) {
          p.state = state
          bump()
        }
      })
      if (res.status === 'done' && res.answer) {
        addRecord('answers', {
          cropId: crop.id,
          question: q,
          answer: res.answer,
          photos: sent.photos,
          costUsd: res.costUsd ?? null,
          ...(res.sources ? { sources: { read: res.sources.read.length, removed: res.sources.removed } } : {}),
          followUpOf: sent.followUpOf,
        })
        pending.delete(crop.id)
      } else {
        pending.set(crop.id, { ...pending.get(crop.id)!, error: res.error || t('No answer came back.') })
      }
    } catch (e) {
      const msg = (e as Error).message
      pending.set(crop.id, {
        ...pending.get(crop.id)!,
        error: /fetch|network|load/i.test(msg) ? t('Your computer did not answer. Is it on, with the helper running?') : msg,
      })
    }
    bump()
  }

  const waitingFor = busy && !busy.error
  return (
    <>
      <div className={`card assist-status${health.state === 'down' ? ' is-down' : ''}`} role="status">
        {health.state === 'checking' && <span>{t('Checking your computer…')}</span>}
        {health.state === 'ok' && (
          <span>
            ● {t('Your computer is connected')}
            {health.info?.claude ? ` · ${health.info.claude}` : ''}
          </span>
        )}
        {health.state === 'down' && (
          <span>
            ● {t('Your computer is not answering. Turn it on and start the helper.')}{' '}
            <button type="button" className="link-btn" onClick={health.retry}>
              {t('Check again')}
            </button>
          </span>
        )}
        {health.state === 'nokey' && <span>● {t('The key is not accepted. Open the new link from the helper.')}</span>}
      </div>

      <form
        ref={formRef}
        className="card assist-form"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        {followUp && (
          <div className="assist-followup">
            <span>
              ↪ {t('Following up on')}: <i>{followUp.question.slice(0, 90)}</i>
            </span>
            <button type="button" className="link-btn" onClick={() => setFollowUp(null)}>
              {t('Cancel')}
            </button>
          </div>
        )}
        <label className="field-label" htmlFor={`ask-${crop.id}`}>
          {t('Your question')}
        </label>
        <textarea
          id={`ask-${crop.id}`}
          className="input assist-input"
          rows={4}
          value={question}
          placeholder={t(
            'Describe what you see and what you want to know, e.g. “Lower leaves turn yellow with brown spots. What is it and what should I do?”',
          )}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!!waitingFor}
        />
        <div className="assist-photos">
          {photos.map((p, i) => (
            <span key={i} className="assist-thumb">
              <img src={p.preview} alt={t('Photo {n}', { n: i + 1 })} />
              <button type="button" aria-label={t('Remove photo')} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          ))}
          {photos.length < 4 && (
            <label className="btn btn-ghost btn-small assist-add-photo">
              📷 {t('Add photos')} ({photos.length}/4)
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => void addPhotos(e.target.files)}
                disabled={!!waitingFor}
              />
            </label>
          )}
        </div>
        <div className="assist-actions">
          <button type="button" className="link-btn" onClick={() => setShowContext(!showContext)} aria-expanded={showContext}>
            {showContext ? t('Hide what is sent') : t('What is sent with the question')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!!waitingFor || !question.trim()}>
            {t('Ask')}
          </button>
        </div>
        {showContext && <pre className="assist-context">{cropContext(db, crop)}</pre>}
        {error && <p className="form-error">{error}</p>}
        <p className="field-hint">
          {t('Each question is answered on its own, with this crop’s data. Answers use trusted sources and name them.')}{' '}
          {t('Only questions about farming and your farm are answered.')}
        </p>
      </form>

      {busy && <PendingCard crop={crop} p={busy} />}

      {answers.length === 0 && !busy ? (
        <Empty title={t('No questions yet')}>{t('Ask the first one above. You can add up to 4 photos.')}</Empty>
      ) : (
        <div className="assist-list">
          {answers.map((a) => (
            <article key={a.id} className="card assist-answer">
              <p className="assist-q">
                <b>{a.question}</b>
                {a.photos > 0 && <span className="assist-meta"> · 📷 {a.photos}</span>}
              </p>
              <Markdown text={a.answer} />
              {a.sources && (
                <p className={`assist-check ${a.sources.read ? 'is-ok' : 'is-unsure'}`}>
                  {a.sources.read
                    ? '✓ ' + t('Checked: based on {n} trusted pages that were opened and read.', { n: a.sources.read })
                    : 'ℹ ' + t('No trusted page was opened for this answer. Treat it as unconfirmed.')}
                  {a.sources.removed > 0 && ' ' + t('{n} unchecked links were removed.', { n: a.sources.removed })}
                </p>
              )}
              <p className="assist-caution">
                ⚠{' '}
                {t(
                  'AI answer. Before spraying, buying or other important decisions, check with an agronomist and follow the product label.',
                )}
              </p>
              <div className="assist-foot">
                <span className="assist-meta">{formatDateTime(a.createdAt)}</span>
                <span className="assist-foot-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      setFollowUp(a)
                      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                    disabled={!!waitingFor}
                  >
                    ↪ {t('Continue')}
                  </button>
                  <DeleteButton onDelete={() => removeRecord('answers', a.id)} />
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}

function PendingCard({ crop, p }: { crop: SeasonCrop; p: Pending }) {
  const t = useT()
  const [, tick] = useState(0)
  useEffect(() => {
    if (p.error) return
    const i = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [p.error])
  const secs = Math.round((Date.now() - p.started) / 1000)
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  return (
    <div className={`card assist-pending${p.error ? ' is-error' : ''}`} role="status" aria-live="polite">
      <p className="assist-q">
        <b>{p.question}</b>
        {p.photos > 0 && <span className="assist-meta"> · 📷 {p.photos}</span>}
      </p>
      {p.error ? (
        <>
          <p className="form-error">{p.error}</p>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              pending.delete(crop.id)
              bump()
            }}
          >
            {t('Close')}
          </button>
        </>
      ) : (
        <p className="assist-thinking">
          <span className="assist-dots" aria-hidden="true" />{' '}
          {p.state?.status === 'waiting' && p.state.position
            ? t('Waiting in line ({n})…', { n: p.state.position })
            : t('Claude is looking into it… {time}', { time })}
          <span className="assist-meta"> · {t('Usually 30 seconds to 2 minutes, longer when it searches sources.')}</span>
        </p>
      )}
    </div>
  )
}

/** Is the helper on the owner's computer reachable? */
function useHealth(link: HelperLink | null) {
  const [state, setState] = useState<'checking' | 'ok' | 'down' | 'nokey'>('checking')
  const [info, setInfo] = useState<HelperHealth | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!link) return
    let alive = true
    setState('checking')
    helperHealth(link)
      .then((h) => {
        if (!alive) return
        setInfo(h)
        setState('ok')
      })
      .catch((e: Error) => alive && setState(/key/.test(e.message) ? 'nokey' : 'down'))
    return () => {
      alive = false
    }
  }, [link, n])
  return { state, info, retry: () => setN((x) => x + 1) }
}

function NotLinked() {
  const t = useT()
  const session = useCloud().session
  const status = session?.user.assistantRequest ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // waiting for the answer in Telegram: check every few seconds; the link arrives by itself
  useEffect(() => {
    if (status !== 'pending') return
    const i = setInterval(() => void refreshMe(false).catch(() => {}), 6000)
    return () => clearInterval(i)
  }, [status])

  async function ask() {
    setBusy(true)
    setError(null)
    try {
      await requestAssistant()
    } catch (e) {
      const code = (e as Error).message
      setError(
        t(
          code === 'no_assistant_owner'
            ? 'Nobody in your farm has the assistant running yet.'
            : code === 'owner_cannot_be_messaged'
              ? 'The owner of the assistant has not started the Telegram bot yet.'
              : code === 'offline'
                ? 'No internet connection. Try again.'
                : 'Something went wrong. Try again.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card assist-setup">
      <p className="empty-title">🤖 {t('The assistant is not linked on this device')}</p>
      {session ? (
        <>
          {status === 'pending' ? (
            <p role="status">
              ⏳ {t('Request sent. The owner of the assistant gets it in Telegram; it turns on here as soon as they allow it.')}
            </p>
          ) : (
            <p>
              {status === 'rejected'
                ? t('The last request was not allowed. You can ask again.')
                : t('Ask the person who runs the assistant on their computer. They get a message in Telegram and allow it with one tap.')}
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="assist-setup-actions">
            <button type="button" className="btn btn-primary" disabled={busy || status === 'pending'} onClick={() => void ask()}>
              {busy ? t('Please wait…') : status === 'pending' ? t('Waiting for approval') : t('Ask for access')}
            </button>
            <a className="btn btn-ghost" href={href('settings', 'assistant')}>
              {t('Setup steps')}
            </a>
          </div>
        </>
      ) : (
        <>
          <p>
            {t('The assistant runs through Claude Code on your own computer, with your Claude account. Only devices you link can use it.')}
          </p>
          <ol>
            <li>{t('On your computer, start the AgroLedger helper (see the steps in Settings).')}</li>
            <li>{t('It prints a link. Open that link on this device — the assistant is then linked here.')}</li>
          </ol>
          <a className="btn btn-primary" href={href('settings', 'assistant')}>
            {t('Setup steps')}
          </a>
        </>
      )}
    </div>
  )
}
