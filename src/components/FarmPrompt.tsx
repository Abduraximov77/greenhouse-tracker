import { useState } from 'react'
import { cloudAvailable, useCloud } from '../lib/cloud'
import { href } from '../lib/router'
import { useT } from '../lib/i18n'

const LATER_KEY = 'agroledger:farm-prompt-later'

/** On the first screen until this phone is in a farm: points to Settings → Account. */
export function FarmPrompt() {
  const t = useT()
  const c = useCloud()
  const [later, setLater] = useState(() => {
    try {
      return Number(localStorage.getItem(LATER_KEY) || 0) > Date.now()
    } catch {
      return false
    }
  })
  if (!cloudAvailable()) return null
  const s = c.session
  if (s?.farms.some((f) => f.id === s.farmId && f.status === 'active')) return null
  const waiting = !!s?.farms.some((f) => f.status === 'pending')
  if (later && !waiting) return null

  function hide() {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now() + 7 * 86400000))
    } catch {
      // storage blocked
    }
    setLater(true)
  }

  return (
    <div className="card wx-card wx-empty farm-prompt">
      <span className="wx-empty-icon" aria-hidden="true">
        👨‍👩‍👦
      </span>
      <div>
        <p className="wx-title">{waiting ? t('Waiting for the owner to allow you') : t('Share the farm with your family')}</p>
        <p className="field-hint">
          {waiting
            ? t('An owner of the farm gets your request in Telegram. The records appear here once they allow it.')
            : s
              ? t('Create a farm to share your records, or join your family’s farm with its code and password.')
              : t('Sign in with Telegram, then create a farm or join your family’s farm. Until then, records stay only on this device.')}
        </p>
      </div>
      <div className="farm-prompt-actions">
        <a className="btn btn-primary btn-small" href={href('settings')}>
          {waiting ? t('Open') : s ? t('Create or join') : t('Sign in')}
        </a>
        {!waiting && (
          <button className="btn btn-ghost btn-small" onClick={hide}>
            {t('Later')}
          </button>
        )}
      </div>
    </div>
  )
}
