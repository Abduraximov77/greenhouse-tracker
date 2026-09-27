import { LogoMark } from './Logo'
import { useT } from '../lib/i18n'

export function LoadingScreen({ leaving }: { leaving: boolean }) {
  const t = useT()
  return (
    <div className={`loading-screen${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="loading-inner">
        <div className="loading-mark">
          <LogoMark size={88} />
        </div>
        <h1 className="loading-name">
          Agro<span>Ledger</span>
        </h1>
        <p className="loading-tagline">{t('Greenhouse records')}</p>
        <div className="loading-bar" aria-hidden="true">
          <span />
        </div>
        <span className="sr-only">{t('Loading…')}</span>
      </div>
    </div>
  )
}
