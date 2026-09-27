import { GreenhouseScene } from './GreenhouseScene'
import { LogoMark } from './Logo'

export function LoadingScreen({ leaving }: { leaving: boolean }) {
  return (
    <div className={`loading-screen${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="loading-inner">
        <GreenhouseScene />
        <div className="loading-brand">
          <LogoMark size={44} />
          <h1>Greenhouse Tracker</h1>
        </div>
        <div className="loading-bar" aria-hidden="true">
          <span />
        </div>
        <p className="loading-text">Opening the greenhouse…</p>
      </div>
    </div>
  )
}
