import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { href } from '../lib/router'
import {
  decodeConnectCode,
  helperHealth,
  isHelperAddress,
  revokeOnHelper,
  setHelperLink,
  useHelperLink,
  type HelperHealth,
} from '../lib/assistant'
import { Breadcrumbs, PageHead } from '../components/ui'
import { assistantPeople, revokeAssistant, useCloud, type AssistantPerson } from '../lib/cloud'

const HELPER_FILE = 'helper/agroledger-helper.mjs'

/**
 * Opened from the link the helper prints: saves the helper's address and key on this device only,
 * then moves to "#/linked" so the key doesn't stay in the address bar or history.
 */
export function ConnectPage({ code }: { code: string }) {
  const t = useT()
  const decoded = decodeConnectCode(code)
  // only the helper's own kinds of address are accepted
  const link = decoded && isHelperAddress(decoded.u) ? decoded : null
  const current = useHelperLink()
  const host = link ? new URL(link.u).host : ''

  function accept() {
    if (!link) return
    setHelperLink(link)
    history.replaceState(null, '', location.pathname + location.search + '#/linked')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
  function cancel() {
    history.replaceState(null, '', location.pathname + location.search + '#/')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }

  return (
    <>
      <Breadcrumbs items={[{ label: t('Seasons'), to: [] }, { label: t('AI assistant') }]} />
      <PageHead title={t('Link the AI assistant')} />
      <div className="card settings-card">
        {!link ? (
          <p className="form-error">{t('This link is not valid. Copy the whole link from the helper window again.')}</p>
        ) : (
          <>
            <p>{t('Link this device to the AI assistant on this computer address?')}</p>
            <p>
              <code>{host}</code>
            </p>
            <p className="field-hint">
              {t('Only open links your own AgroLedger helper printed. Questions, photos and crop details go to this address.')}
            </p>
            {current && current.k !== link.k && (
              <p className="form-error">{t('This device is already linked to an assistant. This link replaces it.')}</p>
            )}
            <div className="assist-setup-actions">
              <button type="button" className="btn btn-primary" onClick={accept}>
                {t('Link')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={cancel}>
                {t('Cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** After linking: checks that the computer answers. */
export function LinkedPage() {
  const t = useT()
  const link = useHelperLink()
  const [state, setState] = useState<'checking' | 'ok' | 'down'>('checking')
  const [info, setInfo] = useState<HelperHealth | null>(null)
  useEffect(() => {
    if (!link) return
    helperHealth(link)
      .then((h) => {
        setInfo(h)
        setState('ok')
      })
      .catch(() => setState('down'))
  }, [link])

  return (
    <>
      <Breadcrumbs items={[{ label: t('Seasons'), to: [] }, { label: t('AI assistant') }]} />
      <PageHead title={t('Link the AI assistant')} />
      <div className="card settings-card">
        {!link ? (
          <p>{t('Not linked on this device.')}</p>
        ) : state === 'checking' ? (
          <p>{t('Checking your computer…')}</p>
        ) : state === 'ok' ? (
          <>
            <p className="empty-title">✅ {t('Linked on this device')}</p>
            <p className="field-hint">
              {info?.claude ?? ''} · {t('model')}: {info?.model}
            </p>
            <p>{t('Open any crop and choose “Assistant” to ask a question.')}</p>
            <a className="btn btn-primary" href={href()}>
              {t('Go to seasons')}
            </a>
          </>
        ) : (
          <>
            <p className="empty-title">{t('Saved, but your computer is not answering right now.')}</p>
            <p>{t('Make sure the helper window is still open on your computer. The link stays saved on this device.')}</p>
          </>
        )}
      </div>
    </>
  )
}

/** Settings block: is the assistant linked on this device, and how to set it up. */
export function AssistantSettings() {
  const t = useT()
  const link = useHelperLink()
  const [check, setCheck] = useState<string | null>(null)
  const fileUrl = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}${HELPER_FILE}`

  async function test() {
    if (!link) return
    setCheck(t('Checking your computer…'))
    try {
      const h = await helperHealth(link)
      setCheck(`✅ ${t('Your computer is connected')}${h.claude ? ` · ${h.claude}` : ''}`)
    } catch {
      setCheck(t('Your computer is not answering. Turn it on and start the helper.'))
    }
  }

  return (
    <div className="card settings-card" id="assistant">
      {link ? (
        <div className="assist-linked">
          <p>
            <b>✅ {t('Linked on this device')}</b>
            <br />
            <span className="field-hint">{link.u.replace(/^https?:\/\//, '')}</span>
          </p>
          <div className="assist-linked-btns">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void test()}>
              {t('Check')}
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setHelperLink(null)}>
              {t('Unlink this device')}
            </button>
          </div>
          {check && (
            <p className="field-hint" role="status">
              {check}
            </p>
          )}
          <AssistantPeople />
        </div>
      ) : (
        <p>
          <b>{t('Not linked on this device.')}</b>
        </p>
      )}

      <details className="assist-steps" open={!link}>
        <summary>{t('How to set it up (once, on your computer)')}</summary>
        <ol>
          <li>
            {t('Install Node.js (version 18 or newer) and Claude Code, then sign in to Claude Code with your Claude account:')}
            <pre>claude</pre>
          </li>
          <li>
            {t('To use it from your phone too, install cloudflared (free):')}
            <pre>{`macOS:   brew install cloudflared\nWindows: winget install --id Cloudflare.cloudflared`}</pre>
          </li>
          <li>
            {t('Download the helper:')}{' '}
            <a href={fileUrl} download>
              agroledger-helper.mjs
            </a>
          </li>
          <li>
            {t('In a terminal, in the folder where you saved it, run:')}
            <pre>node agroledger-helper.mjs</pre>
          </li>
          <li>
            {t(
              'It prints a link. Open it once on each of your devices (phone, laptop); after restarts they find the helper by themselves. Keep the link private.',
            )}
          </li>
          <li>{t('Leave the helper window open. Answers come only while your computer is on and online.')}</li>
        </ol>
        <p className="field-hint">
          {t(
            'Each question is one separate Claude Code run with your account. Photos are sent to your computer and deleted after the answer.',
          )}
        </p>
        <p className="field-label">{t('Or on a rented server (works when your computer is off)')}</p>
        <ol>
          <li>{t('Rent a small Ubuntu server outside China (about $4–6 a month).')}</li>
          <li>
            {t('On your computer run this and copy the token it prints (never share it):')}
            <pre>claude setup-token</pre>
          </li>
          <li>
            {t('Connect to the server and run:')}
            <pre>{`curl -fsSL ${location.origin}/helper/server-setup.sh -o setup.sh && sudo bash setup.sh`}</pre>
          </li>
          <li>{t('Paste the token when asked, then open the link it prints on your devices. It answers only you.')}</li>
        </ol>
      </details>
    </div>
  )
}

/** The assistant's owner sees who else uses it (allowed through Telegram) and can take access away. */
function AssistantPeople() {
  const t = useT()
  const owner = !!useCloud().session?.user.assistantOwner
  const link = useHelperLink()
  const [people, setPeople] = useState<AssistantPerson[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!owner) return
    assistantPeople()
      .then((r) => setPeople(r.people))
      .catch(() => setError(true))
  }, [owner])
  if (!owner) return null
  return (
    <div className="assist-people">
      <p className="field-label">{t('People you allowed to use the assistant')}</p>
      {error && <p className="field-hint">{t('Could not load the list. Check the internet.')}</p>}
      {people && people.length === 0 && <p className="field-hint">{t('Nobody else yet.')}</p>}
      {people && people.length > 0 && (
        <ul className="farm-pick">
          {people.map((p) => (
            <li key={p.id}>
              <span>
                <b>{p.name}</b>{' '}
                <span className="field-hint">
                  {p.username ? '@' + p.username + ' · ' : ''}ID {p.id}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  if (window.confirm(t('Take away assistant access from {name}?', { name: p.name }))) {
                    // also cancel the pass on the computer, so it stops at once (if the computer is on)
                    if (link && p.pass) void revokeOnHelper(link, p.pass).catch(() => {})
                    void revokeAssistant(p.id)
                      .then((r) => setPeople(r.people))
                      .catch(() => setError(true))
                  }
                }}
              >
                {t('Take away')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="field-hint">
        {t('Each person has their own pass, not your key. Taking it away stops it on your computer at once if the helper is running.')}
      </p>
    </div>
  )
}
