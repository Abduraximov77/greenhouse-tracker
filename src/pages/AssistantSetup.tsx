import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { href } from '../lib/router'
import { decodeConnectCode, helperHealth, setHelperLink, useHelperLink, type HelperHealth } from '../lib/assistant'
import { Breadcrumbs, PageHead } from '../components/ui'

const HELPER_FILE = 'helper/agroledger-helper.mjs'

/**
 * Opened from the link the helper prints: saves the helper's address and key on this device only,
 * then moves to "#/linked" so the key doesn't stay in the address bar or history.
 */
export function ConnectPage({ code }: { code: string }) {
  const t = useT()
  const link = decodeConnectCode(code)
  useEffect(() => {
    if (!link) return
    setHelperLink(link)
    history.replaceState(null, '', location.pathname + location.search + '#/linked')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])
  if (link) return null
  return (
    <>
      <Breadcrumbs items={[{ label: t('Seasons'), to: [] }, { label: t('AI assistant') }]} />
      <PageHead title={t('Link the AI assistant')} />
      <div className="card settings-card">
        <p className="form-error">{t('This link is not valid. Copy the whole link from the helper window again.')}</p>
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
          <li>{t('It prints a link. Open it on each of your devices (phone, laptop). Keep the link private.')}</li>
          <li>{t('Leave the helper window open. Answers come only while your computer is on and online.')}</li>
        </ol>
        <p className="field-hint">
          {t(
            'Each question is one separate Claude Code run with your account. Photos are sent to your computer and deleted after the answer.',
          )}
        </p>
      </details>
    </div>
  )
}
