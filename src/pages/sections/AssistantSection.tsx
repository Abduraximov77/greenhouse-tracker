import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { addRecord, removeRecord, useDB, type Answer, type SeasonCrop } from '../../lib/store'
import { useT } from '../../lib/i18n'
import { href } from '../../lib/router'
import { formatDate, formatDateTime } from '../../lib/format'
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
import { DeleteButton } from '../../components/ui'
import { refreshMe, requestAssistant, useCloud } from '../../lib/cloud'
import { Markdown } from '../../components/Markdown'

// Questions still being answered, kept outside the page so leaving and coming back doesn't lose them.
type Pending = { chatId: string; question: string; photos: number; state: JobState | null; started: number; error?: string }
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
type Chat = { id: string; messages: Answer[]; last: string }

const newChatId = () => crypto.randomUUID()
/** A chat holds this many questions; then a new chat starts (long chats send more each time). */
const CHAT_LIMIT = 5

/** All chats about this crop; older answers without a chat are each their own chat. */
function chatsOf(answers: Answer[]): Chat[] {
  const map = new Map<string, Answer[]>()
  for (const a of answers) {
    const id = a.chatId ?? a.id
    map.set(id, [...(map.get(id) ?? []), a])
  }
  return [...map.entries()]
    .map(([id, list]) => {
      const messages = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      return { id, messages, last: messages[messages.length - 1].createdAt }
    })
    .sort((a, b) => b.last.localeCompare(a.last))
}

/** The AI assistant as a chat about this crop: follow-ups continue the same conversation. */
export function AssistantSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const link = useHelperLink()
  const chats = chatsOf(db.answers.filter((a) => a.cropId === crop.id))
  const busy = usePending(crop.id)

  // the open chat: the one being answered, the one picked, or the newest
  const [picked, setPicked] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const openId = busy?.chatId ?? picked ?? fresh ?? chats[0]?.id ?? null
  const chat = chats.find((c) => c.id === openId) ?? null
  const chatId = openId ?? fresh ?? null

  const [question, setQuestion] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showContext, setShowContext] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const health = useHealth(link)

  const count = chat?.messages.length ?? 0
  const full = count >= CHAT_LIMIT && !busy
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [count, !!busy])

  if (!link) return <NotLinked />

  function startNew() {
    const id = newChatId()
    setFresh(id)
    setPicked(id)
    setQuestion('')
    setPhotos([])
    setError(null)
  }

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
    const id = chatId ?? newChatId()
    setPicked(id)
    const context = cropContext(db, crop)
    const nPhotos = photos.length
    // a short summary of this chat, used only if the computer can't continue the saved conversation
    const earlier = (chat?.messages ?? [])
      .slice(-3)
      .map((m) => `Q: ${m.question}\nA: ${m.answer.slice(0, 700)}`)
      .join('\n\n')
    pending.set(crop.id, { chatId: id, question: q, photos: nPhotos, state: null, started: Date.now() })
    bump()
    setQuestion('')
    setPhotos([])
    try {
      const res = await askHelper(
        link,
        {
          question: q,
          context,
          lang: db.settings.lang,
          images: photos.map(({ type, data }) => ({ type, data })),
          previous: earlier || undefined,
          chat: id,
        },
        (state) => {
          const p = pending.get(crop.id)
          if (p) {
            p.state = state
            bump()
          }
        },
      )
      if (res.status === 'done' && res.answer) {
        addRecord('answers', {
          cropId: crop.id,
          chatId: id,
          question: q,
          answer: res.answer,
          photos: nPhotos,
          costUsd: res.costUsd ?? null,
          ...(res.sources
            ? { sources: { read: res.sources.read.length, removed: res.sources.removed }, sourceUrls: res.sources.read.slice(0, 30) }
            : {}),
        })
        pending.delete(crop.id)
        if (fresh === id) setFresh(null)
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
  const isNew = !chat
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

      <div className="card chat">
        <div className="chat-head">
          {chats.length > 0 ? (
            <select
              className="input input-compact chat-pick"
              aria-label={t('Chats')}
              value={isNew ? '' : (chat?.id ?? '')}
              disabled={!!waitingFor}
              onChange={(e) => {
                setPicked(e.target.value || null)
                setError(null)
              }}
            >
              {isNew && <option value="">{t('New chat')}</option>}
              {chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDate(new Date(c.last).toLocaleDateString('sv'))} · {c.messages[0].question.slice(0, 50)}
                </option>
              ))}
            </select>
          ) : (
            <b>{t('New chat')}</b>
          )}
          <span className="chat-head-actions">
            {!isNew && (
              <button type="button" className="btn btn-ghost btn-small" onClick={startNew} disabled={!!waitingFor}>
                + {t('New chat')}
              </button>
            )}
            {chat && (
              <DeleteButton
                label={t('Delete chat')}
                onDelete={() => {
                  for (const m of chat.messages) removeRecord('answers', m.id)
                  setPicked(null)
                }}
              />
            )}
          </span>
        </div>

        <div className="chat-thread">
          {isNew && !busy && (
            <p className="chat-empty">
              {t('Ask about this crop. You can add up to 4 photos, then ask follow-up questions in the same chat.')}
            </p>
          )}
          {chat?.messages.map((a) => (
            <div key={a.id} className="chat-turn">
              <div className="chat-msg chat-me">
                <p>{a.question}</p>
                <span className="assist-meta">
                  {a.photos > 0 && `📷 ${a.photos} · `}
                  {formatDateTime(a.createdAt)}
                  {a.by ? ` · ${a.by}` : ''}
                </span>
              </div>
              <div className="chat-msg chat-ai">
                <Markdown text={a.answer} links={a.sources ? (a.sourceUrls ?? []) : undefined} />
                {a.sources && (
                  <p className={`assist-check ${a.sources.read ? 'is-ok' : 'is-unsure'}`}>
                    {a.sources.read
                      ? '✓ ' + t('Checked: based on {n} trusted pages that were opened and read.', { n: a.sources.read })
                      : 'ℹ ' + t('No trusted page was opened for this answer. Treat it as unconfirmed.')}
                    {a.sources.removed > 0 && ' ' + t('{n} unchecked links were removed.', { n: a.sources.removed })}
                  </p>
                )}
              </div>
            </div>
          ))}
          {busy && busy.chatId === (chat?.id ?? chatId) && <PendingBubble crop={crop} p={busy} />}
          <div ref={endRef} />
        </div>

        <p className="assist-caution">
          ⚠ {t('AI answer. Before spraying, buying or other important decisions, check with an agronomist and follow the product label.')}
        </p>
        {full && (
          <div className="chat-full">
            <p>
              {t('This chat has {n} questions. To ask more, start a new chat: it answers faster and uses less of your Claude limit.', {
                n: CHAT_LIMIT,
              })}
            </p>
            <button type="button" className="btn btn-primary" onClick={startNew}>
              + {t('New chat')}
            </button>
          </div>
        )}

        {!full && (
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <textarea
              id={`ask-${crop.id}`}
              className="input assist-input"
              rows={isNew ? 3 : 2}
              value={question}
              aria-label={t('Your question')}
              placeholder={
                isNew
                  ? t(
                      'Describe what you see and what you want to know, e.g. “Lower leaves turn yellow with brown spots. What is it and what should I do?”',
                    )
                  : t('Ask a follow-up question…')
              }
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
              <button type="submit" className="btn btn-primary chat-send" disabled={!!waitingFor || !question.trim()}>
                {t('Send')}
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="assist-actions">
              <button type="button" className="link-btn" onClick={() => setShowContext(!showContext)} aria-expanded={showContext}>
                {showContext ? t('Hide what is sent') : t('What is sent with the question')}
              </button>
            </div>
            {showContext && <pre className="assist-context">{cropContext(db, crop)}</pre>}
            <p className="field-hint">
              {t('Follow-ups continue the same conversation and reuse the pages already read, so they use less of your Claude limit.')}{' '}
              {t('Only questions about farming and your farm are answered.')}
            </p>
          </form>
        )}
      </div>
    </>
  )
}

function PendingBubble({ crop, p }: { crop: SeasonCrop; p: Pending }) {
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
    <div className="chat-turn" role="status" aria-live="polite">
      <div className="chat-msg chat-me">
        <p>{p.question}</p>
        {p.photos > 0 && <span className="assist-meta">📷 {p.photos}</span>}
      </div>
      <div className={`chat-msg chat-ai${p.error ? ' is-error' : ''}`}>
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
            ? 'Nobody has set up the assistant yet.'
            : code === 'owner_cannot_be_messaged'
              ? 'The owner of the assistant has not started the Telegram bot yet.'
              : code === 'wait_before_asking'
                ? 'You were turned down recently. Wait an hour before asking again.'
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
