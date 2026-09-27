export const APP_NAME = 'AgroLedger'

type LogoMarkProps = { size?: number; title?: string }

/** The square logo mark: a greenhouse arch with a single leaf growing inside. */
export function LogoMark({ size = 40, title = APP_NAME }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="14" fill="#2A7F50" />
      <path
        d="M14 50V30C14 19.5 22 12.5 32 11C42 12.5 50 19.5 50 30V50"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 50H54" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M32 49V33" stroke="#C8F0D2" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 37C32 29 38 24 45 24C45 32 39 37 32 37Z" fill="#C8F0D2" />
    </svg>
  )
}

/** Mark + wordmark, used in the header. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-name">
        Agro<span className="logo-accent">Ledger</span>
      </span>
    </span>
  )
}
