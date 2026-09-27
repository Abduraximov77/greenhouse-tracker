import { LogoMark } from './Logo'

export function LoadingScreen({ leaving }: { leaving: boolean }) {
  return (
    <div className={`loading-screen${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="loading-inner">
        <div className="loading-mark">
          <LogoMark size={88} />
        </div>
        <h1 className="loading-name">
          Agro<span>Ledger</span>
        </h1>
        <p className="loading-tagline">Greenhouse records</p>
        <div className="loading-bar" aria-hidden="true">
          <span />
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  )
}
