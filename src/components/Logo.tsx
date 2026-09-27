type LogoMarkProps = { size?: number; title?: string }

/** The square logo mark: a greenhouse arch with a sprout growing inside. */
export function LogoMark({ size = 40, title = 'Greenhouse Tracker' }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="15" fill="#1F5E3B" />
      {/* sun */}
      <circle cx="49" cy="15" r="5" fill="#F2B544" />
      {/* greenhouse glass */}
      <path d="M13 51V31C13 19 21 12 32 10C43 12 51 19 51 31V51Z" fill="#FFFFFF" fillOpacity="0.12" />
      {/* greenhouse frame */}
      <path
        d="M13 51V31C13 19 21 12 32 10C43 12 51 19 51 31V51"
        fill="none"
        stroke="#F4F1E6"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 31H51" stroke="#F4F1E6" strokeWidth="2" strokeOpacity="0.55" />
      {/* ground */}
      <path d="M8 51H56" stroke="#F4F1E6" strokeWidth="3.2" strokeLinecap="round" />
      {/* sprout */}
      <path d="M32 50V34" stroke="#8BD06F" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 40C32 34 27 31 22 31C22 37 26 40 32 40Z" fill="#8BD06F" />
      <path d="M32 36C32 29 37 25 43 25C43 32 38 36 32 36Z" fill="#B6E59A" />
    </svg>
  )
}

/** Mark + wordmark, used in the header. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-text">
        <span className="logo-name">Greenhouse</span>
        <span className="logo-sub">Tracker</span>
      </span>
    </span>
  )
}
