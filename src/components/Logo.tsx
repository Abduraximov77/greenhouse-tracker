export const APP_NAME = 'AgroLedger'

/** The letters A and L (IBM Plex Serif, turned into shapes so they look the same on every device). */
const A_PATH =
  'M9.5 43.2H11.03L17.62 24.06H21.38L27.98 43.2H29.51V45H21.2V43.2H23.69L22.12 38.49H14.89L13.34 43.2H15.83V45H9.5ZM15.44 36.6H21.59L18.59 27.3H18.44Z'
const L_PATH = 'M37.17 43.2H39.3V25.86H37.17V24.06H45.75V25.86H43.5V43.05H49.8V39.09H52.89V45H37.17Z'

/** Colours: deep teal tile, white letters, gold column line. */
const TILE = '#0B3D38'
const GOLD = '#C9A53E'

/** The A | L mark drawn on a 64×64 grid: initials split by a ruled column line, underlined like a ledger total. */
function Mark({ ink, gold }: { ink: string; gold: string }) {
  return (
    <>
      <path d={A_PATH} fill={ink} />
      <path d="M32 14V50" stroke={gold} strokeWidth="2" />
      <path d={L_PATH} fill={ink} />
      <path d="M8 52H56" stroke={ink} strokeWidth="1.6" />
    </>
  )
}

type LogoMarkProps = { size?: number; title?: string; variant?: 'tile' | 'bare' }

/**
 * The logo mark. "tile": on its deep teal square (app icon, loading screen).
 * "bare": letters only, in the current text colour, for use on the teal top bar.
 */
export function LogoMark({ size = 40, title = APP_NAME, variant = 'tile' }: LogoMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      {variant === 'tile' ? (
        <>
          <rect width="64" height="64" rx="6" fill={TILE} />
          <g transform="translate(5 5) scale(0.844)">
            <Mark ink="#FFFFFF" gold={GOLD} />
          </g>
        </>
      ) : (
        <Mark ink="currentColor" gold="var(--logo-gold, #E0C46A)" />
      )}
    </svg>
  )
}

/** Mark + wordmark, used in the header. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} variant="bare" />
      <span className="logo-name">
        Agro<span className="logo-accent">Ledger</span>
      </span>
    </span>
  )
}
