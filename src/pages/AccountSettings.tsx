import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { formatDateTime } from '../lib/format'
import { hasOwnData, useDB } from '../lib/store'
import {
  BOT_USERNAME,
  activeFarm,
  changeFarmPassword,
  chooseFarm,
  cloudAvailable,
  insideTelegram,
  openFarm,
  signInInsideTelegram,
  createFarm,
  enterFarm,
  farmInfo,
  joinFarm,
  leaveFarm,
  memberAction,
  refreshMe,
  restoreItem,
  signInWithWidget,
  signOut,
  signOutEverywhere,
  syncNow,
  trashList,
  updateMe,
  useCloud,
  type FarmInfo,
  type TrashItem,
} from '../lib/cloud'

const ERR: Record<string, string> = {
  offline: 'No internet connection. Try again.',
  wrong_code_or_password: 'Wrong farm code or password.',
  locked: 'Too many wrong tries. Wait 15 minutes and try again.',
  password_too_short: 'The password must be at least 6 characters.',
  name_required: 'Enter the farm name.',
  last_owner: 'A farm must always have at least one owner. Make someone else an owner first.',
  owners_only: 'Only owners can do this.',
  telegram_check_failed: 'Telegram sign-in could not be checked. Try again.',
  unsent: 'Some changes are not sent yet. Connect to the internet and try again.',
  too_many_farms: 'You have created the most farms allowed (5).',
  wait_before_asking: 'You were turned down recently. Wait an hour before asking again.',
  farm_full: 'This farm is full. Ask the owner to delete old records.',
  too_big: 'Too much data at once. Try again.',
  no_space: 'This phone is out of storage space. Free some space, then try again.',
  not_member: 'You are no longer in this farm.',
  already_decided: 'Someone already answered this request.',
}

/** Settings → Account: Telegram sign-in, the farm, family members, alerts. */
export function AccountSettings() {
  const t = useT()
  const cloud = useCloud()
  const [error, setError] = useState<string | null>(null)
  const errText = (e: unknown) => t(ERR[(e as Error).message] ?? 'Something went wrong. Try again.')

  if (!cloudAvailable()) {
    return (
      <div className="card settings-card account-soon">
        <p className="empty-title">{t('Accounts are coming soon')}</p>
        <p className="field-hint">{t('Signing in and sharing the same records with your family will be set up here.')}</p>
      </div>
    )
  }

  const s = cloud.session
  if (!s) return <SignIn />

  const farm = activeFarm()
  const pendingFarms = s.farms.filter((f) => f.status === 'pending')

  return (
    <div className="account">
      <div className="card settings-card account-me">
        {s.user.photo ? <img className="avatar" src={s.user.photo} alt="" /> : <span className="avatar">{s.user.name.slice(0, 1)}</span>}
        <div className="account-me-text">
          <b>{s.user.name}</b>
          <span className="field-hint">
            {s.user.username ? '@' + s.user.username + ' · ' : ''}
            {t('Signed in with Telegram')}
          </span>
        </div>
        {farm && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => chooseFarm().catch((e) => setError(errText(e)))}>
            {t('Change farm')}
          </button>
        )}
      </div>

      {farm ? (
        <FarmPanel key={farm.id} farmId={farm.id} onError={(e) => setError(errText(e))} />
      ) : pendingFarms.length ? (
        <PendingCard name={pendingFarms[0].name} farmId={pendingFarms[0].id} />
      ) : (
        <CreateOrJoin />
      )}

      {s.farms.filter((f) => f.status === 'active').length > 1 && (
        <div className="card settings-card">
          <label className="field-label" htmlFor="farm-switch">
            {t('Farm')}
          </label>
          <select
            id="farm-switch"
            className="input"
            value={farm?.id ?? ''}
            onChange={(e) => enterFarm(e.target.value, 'replace').catch((err) => setError(errText(err)))}
          >
            {s.farms
              .filter((f) => f.status === 'active')
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} · {f.code}
                </option>
              ))}
          </select>
        </div>
      )}

      <AlertSettings />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The first screen until this device is in a farm: 1) sign in with Telegram, 2) create or join a farm
 * (then wait for an owner). Nothing else in the app opens before that.
 */
export function WelcomeGate() {
  const t = useT()
  const cloud = useCloud()
  const s = cloud.session
  const pending = s?.farms.find((f) => f.status === 'pending')
  const myFarms = s?.farms.filter((f) => f.status === 'active') ?? []
  const step = !s ? 1 : 2
  const inTg = insideTelegram()
  const [tgError, setTgError] = useState(false)
  // inside the Telegram app: sign in again by itself, no button needed
  useEffect(() => {
    if (!s && inTg) void signInInsideTelegram().catch(() => setTgError(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!s])
  return (
    <div className="welcome">
      <div className="welcome-head">
        <h1 className="welcome-title">{t('Welcome to AgroLedger')}</h1>
        <p className="field-hint">{t('Your family’s farm records, on every phone. Two short steps to start:')}</p>
        <ol className="welcome-steps">
          <li className={step === 1 ? 'is-now' : 'is-done'}>
            <span>{step > 1 ? '✓' : '1'}</span>
            {t('Sign in with Telegram')}
          </li>
          <li className={step === 2 ? 'is-now' : ''}>
            <span>2</span>
            {t('Create a farm or join your family’s farm')}
          </li>
        </ol>
      </div>
      {!s ? (
        inTg && !tgError ? (
          <div className="card settings-card">
            <p className="field-hint">{t('Signing in…')}</p>
          </div>
        ) : (
          <SignIn />
        )
      ) : (
        <>
          <div className="card settings-card account-me">
            {s.user.photo ? (
              <img className="avatar" src={s.user.photo} alt="" />
            ) : (
              <span className="avatar">{s.user.name.slice(0, 1)}</span>
            )}
            <div className="account-me-text">
              <b>{s.user.name}</b>
              <span className="field-hint">{t('Signed in with Telegram')}</span>
            </div>
          </div>
          {myFarms.length > 0 && (
            <div className="card settings-card">
              <p className="empty-title">{t('Your farms')}</p>
              <ul className="farm-pick">
                {myFarms.map((f) => (
                  <li key={f.id}>
                    <span>
                      <b>{f.name}</b> <span className="field-hint">{f.code}</span>
                    </span>
                    <button type="button" className="btn btn-primary btn-small" onClick={() => void openFarm(f.id)}>
                      {t('Open')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pending ? <PendingCard name={pending.name} farmId={pending.id} /> : <CreateOrJoin />}
          {!inTg && (
            <button
              type="button"
              className="link-btn welcome-switch"
              onClick={() => {
                if (confirmSignOut(t)) void signOut()
              }}
            >
              {t('Use another Telegram account')}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function confirmSignOut(t: (k: string) => string) {
  return window.confirm(t('Sign out on this device? Your records stay in the farm; sign in again with Telegram to see them.'))
}

/** "Log in with Telegram" button (Telegram's own widget). */
function SignIn() {
  const t = useT()
  const lang = useDB().settings.lang
  const box = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const w = window as unknown as { onTelegramAuth?: (u: Record<string, unknown>) => void }
    w.onTelegramAuth = (user) => {
      setBusy(true)
      setError(null)
      signInWithWidget(user)
        .catch((e: Error) => setError(t(ERR[e.message] ?? 'Something went wrong. Try again.')))
        .finally(() => setBusy(false))
    }
    const el = box.current
    if (!el) return
    el.innerHTML = ''
    const s = document.createElement('script')
    s.src = 'https://telegram.org/js/telegram-widget.js?22'
    s.async = true
    s.setAttribute('data-telegram-login', BOT_USERNAME)
    s.setAttribute('data-size', 'large')
    s.setAttribute('data-radius', '4')
    s.setAttribute('data-request-access', 'write')
    s.setAttribute('data-lang', lang === 'uz' ? 'uz' : lang)
    s.setAttribute('data-onauth', 'onTelegramAuth(user)')
    el.appendChild(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  return (
    <div className="card settings-card account-signin">
      <p className="empty-title">{t('Sign in to share records with your family')}</p>
      <ul className="account-why">
        <li>{t('Everyone in the family sees the same records on their own phone.')}</li>
        <li>{t('Records are kept safely online, not only on this phone.')}</li>
        <li>{t('Weather alerts come to your own Telegram.')}</li>
      </ul>
      <div ref={box} className="tg-login" aria-busy={busy} />
      {busy && <p className="field-hint">{t('Signing in…')}</p>}
      {error && <p className="form-error">{error}</p>}
      <p className="field-hint">
        {t('Press the button, confirm in Telegram, and allow the bot to send you messages (for alerts and approvals).')}
      </p>
    </div>
  )
}

/** No farm yet: make one (becomes owner) or join one with its code + password. */
function CreateOrJoin() {
  const t = useT()
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [code, setCode] = useState('')
  const picking = !!useCloud().session?.picking
  const [move, setMove] = useState(hasOwnData() && !picking)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (mode === 'create') {
      if (!name.trim()) return setError(t('Enter the farm name.'))
      if (pass.length < 6) return setError(t('The password must be at least 6 characters.'))
      if (pass !== pass2) return setError(t('The two passwords are not the same.'))
    } else if (!code.trim() || !pass) return setError(t('Enter the farm code and password.'))
    setBusy(true)
    try {
      if (mode === 'create') await createFarm(name.trim(), pass, move)
      else await joinFarm(code.trim(), pass)
    } catch (e) {
      setError(t(ERR[(e as Error).message] ?? 'Something went wrong. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="card settings-card account-farm-form"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'create'}
          className={mode === 'create' ? 'is-on is-good' : ''}
          onClick={() => setMode('create')}
        >
          🏡 {t('Create a farm')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'join'}
          className={mode === 'join' ? 'is-on is-good' : ''}
          onClick={() => setMode('join')}
        >
          🔑 {t('Join a farm')}
        </button>
      </div>

      {mode === 'create' ? (
        <>
          <p className="field-hint">{t('You become its owner. Then tell your family the farm code and password.')}</p>
          <label className="field">
            <span className="field-label">{t('Farm name')}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Family greenhouse')} />
          </label>
          <label className="field">
            <span className="field-label">{t('Farm password')}</span>
            <input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t('Repeat the password')}</span>
            <input className="input" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          </label>
          {!picking && (
            <label className="check">
              <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
              <span>{t('Move the records on this device into the farm')}</span>
            </label>
          )}
        </>
      ) : (
        <>
          <p className="field-hint">
            {t('Ask the farm owner for the code and password. An owner must allow you before you can see the records.')}
          </p>
          <label className="field">
            <span className="field-label">{t('Farm code')}</span>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="AL-1234"
              autoCapitalize="characters"
            />
          </label>
          <label className="field">
            <span className="field-label">{t('Farm password')}</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </label>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? t('Please wait…') : mode === 'create' ? t('Create the farm') : t('Send request')}
      </button>
    </form>
  )
}

function PendingCard({ name, farmId }: { name: string; farmId: string }) {
  const t = useT()
  useEffect(() => {
    const i = setInterval(() => void refreshMe().catch(() => {}), 8000)
    return () => clearInterval(i)
  }, [])
  return (
    <div className="card settings-card account-pending" role="status">
      <p className="empty-title">⏳ {t('Waiting for approval')}</p>
      <p>
        {t('The owners of “{farm}” got your request in the app and in Telegram. You will be let in when one of them allows it.', {
          farm: name,
        })}
      </p>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => void leaveFarm(farmId)}>
        {t('Cancel the request')}
      </button>
    </div>
  )
}

function SyncLine() {
  const t = useT()
  const c = useCloud()
  const text =
    c.status === 'syncing'
      ? t('Saving to the farm…')
      : c.status === 'offline'
        ? t('No internet: {n} changes will be sent when it is back.', { n: c.pending })
        : c.status === 'error'
          ? t('Could not reach the farm. It will try again.')
          : c.pending
            ? t('{n} changes waiting to be sent', { n: c.pending })
            : c.lastSync
              ? t('All saved to the farm ✓ · {time}', { time: formatDateTime(c.lastSync) })
              : t('Connecting…')
  return (
    <p className={`sync-line sync-${c.status}`} role="status">
      {text}{' '}
      <button type="button" className="link-btn" onClick={() => void syncNow()}>
        {t('Sync now')}
      </button>
    </p>
  )
}

function FarmPanel({ farmId, onError }: { farmId: string; onError: (e: unknown) => void }) {
  const t = useT()
  const cloud = useCloud()
  const [info, setInfo] = useState<FarmInfo | null>(null)
  const [newPass, setNewPass] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [trash, setTrash] = useState<TrashItem[] | null>(null)
  const me = cloud.session?.user.id
  const owner = info?.role === 'owner'

  const load = () => farmInfo(farmId).then(setInfo).catch(onError)
  useEffect(() => {
    void load()
    const i = setInterval(() => void load(), 20000)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId])

  const act = (uid: number, action: 'approve' | 'reject' | 'role' | 'remove', role?: 'owner' | 'member') =>
    memberAction(farmId, uid, action, role).then(setInfo).catch(onError)

  if (!info) return <div className="card settings-card">{t('Loading…')}</div>
  const pend = info.members.filter((m) => m.status === 'pending')
  const active = info.members.filter((m) => m.status === 'active')

  return (
    <>
      <div className="card settings-card account-farm">
        <div className="account-farm-head">
          <div>
            <p className="empty-title">🏡 {info.farm.name}</p>
            <p className="field-hint">
              {t('You')}: <b>{owner ? t('Owner') : t('Member')}</b>
            </p>
          </div>
          <div className="farm-code">
            <span className="field-label">{t('Farm code')}</span>
            <b>{info.farm.code}</b>
          </div>
        </div>
        <SyncLine />
        {cloud.error === 'owners_only' && (
          <p className="form-error">{t('Only owners can delete seasons, crops and workers. It was put back.')}</p>
        )}
      </div>

      {owner && pend.length > 0 && (
        <div className="card settings-card account-requests">
          {pend.map((m) => (
            <div key={m.id} className="req">
              <b>👤 {t('{name} wants to join the farm', { name: m.name })}</b>
              {m.username && <span className="field-hint">@{m.username}</span>}
              <div className="reqbtns">
                <button type="button" className="btn btn-primary btn-small" onClick={() => void act(m.id, 'approve')}>
                  {t('Allow')}
                </button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => void act(m.id, 'reject')}>
                  {t('Reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card settings-card">
        <p className="field-label">{t('Family members ({n})', { n: active.length })}</p>
        <ul className="people">
          {active.map((m) => (
            <li key={m.id} className="person">
              {m.photo ? <img className="avatar" src={m.photo} alt="" /> : <span className="avatar">{m.name.slice(0, 1)}</span>}
              <div>
                <b>
                  {m.name}
                  {m.id === me ? ` (${t('you')})` : ''}
                </b>
                <span className="field-hint">{m.last_seen ? t('Last seen {time}', { time: formatDateTime(m.last_seen) }) : ''}</span>
              </div>
              {owner && m.id !== me ? (
                <span className="person-actions">
                  <select
                    className="input input-compact"
                    aria-label={t('Role')}
                    value={m.role}
                    onChange={(e) => void act(m.id, 'role', e.target.value as 'owner' | 'member')}
                  >
                    <option value="owner">{t('Owner')}</option>
                    <option value="member">{t('Member')}</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      if (window.confirm(t('Remove {name} from the farm?', { name: m.name }))) void act(m.id, 'remove')
                    }}
                  >
                    {t('Remove')}
                  </button>
                </span>
              ) : (
                <span className={`role${m.role === 'owner' ? ' owner' : ''}`}>{m.role === 'owner' ? t('Owner') : t('Member')}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="field-hint">
          {t('Owners can change everything and let people in. Members add daily records but cannot delete seasons, crops or workers.')}
        </p>
        <p className="field-hint">
          {t('To add someone: give them the farm code and password; they sign in with Telegram and choose “Join a farm”.')}
        </p>
      </div>

      {owner && (
        <div className="card settings-card">
          <p className="field-label">{t('Security')}</p>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (newPass.length < 6) return setMsg(t('The password must be at least 6 characters.'))
              changeFarmPassword(farmId, newPass)
                .then(() => {
                  setNewPass('')
                  setMsg(t('Farm password changed. People already in the farm stay in.'))
                })
                .catch(onError)
            }}
          >
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder={t('New farm password')}
              aria-label={t('New farm password')}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
            <button type="submit" className="btn btn-ghost">
              {t('Change password')}
            </button>
          </form>
          {msg && <p className="field-hint">{msg}</p>}
          <div className="account-sec-btns">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                trashList(farmId)
                  .then((r) => setTrash(r.items))
                  .catch(onError)
              }
            >
              🗑 {t('Deleted records (30 days)')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(t('Sign out every device of everyone in this farm? Everyone signs in again with Telegram.')))
                  void signOutEverywhere(farmId).catch(onError)
              }}
            >
              {t('Sign out all devices')}
            </button>
          </div>
          {trash && (
            <ul className="trash">
              {trash.length === 0 && <li className="field-hint">{t('Nothing was deleted in the last 30 days.')}</li>}
              {trash.map((it) => (
                <li key={it.coll + it.id}>
                  <span>
                    <b>{t(COLL_LABEL[it.coll] ?? it.coll)}</b>: {describe(it.data)}
                    <span className="field-hint">
                      {' '}
                      · {formatDateTime(it.deletedAt)}
                      {it.by ? ` · ${it.by}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() =>
                      restoreItem(farmId, it.coll, it.id)
                        .then(() => setTrash(trash.filter((x) => x !== it)))
                        .catch(onError)
                    }
                  >
                    {t('Restore')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

const COLL_LABEL: Record<string, string> = {
  seasons: 'Season',
  crops: 'Crop',
  harvests: 'Harvest',
  shipments: 'Truck',
  expenses: 'Expense',
  incomes: 'Income',
  deals: 'Give & take',
  sales: 'Sale',
  workers: 'Worker',
  attendance: 'Worker day',
  answers: 'Assistant',
}
function describe(d: Record<string, unknown>) {
  const v = d.name ?? d.crop ?? d.startYear ?? d.person ?? d.truckNumber ?? d.source ?? d.question ?? d.date ?? ''
  return String(v).slice(0, 60)
}

function AlertSettings() {
  const t = useT()
  const c = useCloud()
  const lang = useDB().settings.lang
  const u = c.session?.user
  // keep the language of Telegram messages the same as the app's
  useEffect(() => {
    if (u && u.lang !== lang) void updateMe({ lang }).catch(() => {})
  }, [u, lang])
  if (!u || !activeFarm()) return null
  return (
    <div className="card settings-card">
      <p className="field-label">🔔 {t('Weather alerts in Telegram')}</p>
      <label className="check">
        <input type="checkbox" checked={u.alertsOn} onChange={(e) => void updateMe({ alertsOn: e.target.checked })} />
        <span>{t('Send me weather alerts')}</span>
      </label>
      {u.alertsOn && (
        <label className="field">
          <span className="field-label">{t('Evening message at')}</span>
          <select className="input" value={u.alertHour} onChange={(e) => void updateMe({ alertHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
          <span className="field-hint">
            {t(
              'Warnings for tomorrow come at this time. Dangerous weather (frost, storm, strong wind) comes straight away, between 06:00 and 23:00.',
            )}
          </span>
        </label>
      )}
      {!u.canMessage && (
        <p className="form-error">
          {t('The bot cannot write to you yet.')}{' '}
          <a href={`https://t.me/${BOT_USERNAME}?start=alerts`} target="_blank" rel="noreferrer">
            {t('Open the bot and press Start')}
          </a>
        </p>
      )}
    </div>
  )
}
