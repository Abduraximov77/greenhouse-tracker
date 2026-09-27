/**
 * Illustrated greenhouse used on the loading screen.
 * Plants inside grow in a loop; the sun turns slowly; light sweeps the glass.
 */
const plants = [
  { x: 112, h: 1.0, d: 0 },
  { x: 134, h: 0.8, d: 0.15 },
  { x: 156, h: 1.1, d: 0.3 },
  { x: 244, h: 0.9, d: 0.45 },
  { x: 266, h: 1.15, d: 0.6 },
  { x: 288, h: 0.85, d: 0.75 },
]

export function GreenhouseScene() {
  return (
    <svg
      className="scene"
      viewBox="0 0 400 260"
      role="img"
      aria-label="A glass greenhouse with plants growing inside"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky-top)" />
          <stop offset="1" stopColor="var(--sky-bottom)" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DFF3F1" stopOpacity="0.75" />
          <stop offset="1" stopColor="#BFE3DC" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="card">
          <rect width="400" height="260" rx="20" />
        </clipPath>
        <clipPath id="house">
          <path d="M90 215V120L200 60L310 120V215Z" />
        </clipPath>
      </defs>

      <g clipPath="url(#card)">
      {/* sky */}
      <rect width="400" height="260" rx="20" fill="url(#sky)" />

      {/* sun */}
      <g transform="translate(330 52)">
        <g className="sun-rays">
          {Array.from({ length: 8 }).map((_, i) => (
            <rect
              key={i}
              x="-2"
              y="-34"
              width="4"
              height="10"
              rx="2"
              fill="#F2B544"
              transform={`rotate(${i * 45})`}
            />
          ))}
        </g>
        <circle r="18" fill="#F2B544" />
      </g>

      {/* hills */}
      <path d="M0 190C60 150 120 160 180 180C240 150 330 140 400 175V260H0Z" fill="var(--hill-back)" />
      <path d="M0 210C80 185 150 195 220 205C290 190 350 188 400 200V260H0Z" fill="var(--hill-front)" />

      {/* greenhouse glass body */}
      <path d="M90 215V120L200 60L310 120V215Z" fill="url(#glass)" />

      {/* plants inside, behind the frame */}
      <g clipPath="url(#house)">
        <rect x="96" y="203" width="80" height="12" rx="3" fill="#8A5A3B" />
        <rect x="224" y="203" width="80" height="12" rx="3" fill="#8A5A3B" />
        {plants.map((p) => (
          <g
            key={p.x}
            className="plant"
            style={{ animationDelay: `${p.d}s`, transformOrigin: `${p.x}px 204px` }}
          >
            <path d={`M${p.x} 204V${204 - 34 * p.h}`} stroke="#3E8E4E" strokeWidth="3" strokeLinecap="round" />
            <path
              d={`M${p.x} ${204 - 14 * p.h}C${p.x - 4} ${204 - 24 * p.h} ${p.x - 14} ${204 - 26 * p.h} ${p.x - 16} ${204 - 22 * p.h}C${p.x - 12} ${204 - 14 * p.h} ${p.x - 5} ${204 - 12 * p.h} ${p.x} ${204 - 14 * p.h}Z`}
              fill="#5DB85C"
            />
            <path
              d={`M${p.x} ${204 - 24 * p.h}C${p.x + 4} ${204 - 34 * p.h} ${p.x + 14} ${204 - 36 * p.h} ${p.x + 16} ${204 - 32 * p.h}C${p.x + 12} ${204 - 24 * p.h} ${p.x + 5} ${204 - 22 * p.h} ${p.x} ${204 - 24 * p.h}Z`}
              fill="#7FCB6A"
            />
            <circle cx={p.x} cy={204 - 36 * p.h} r="4" fill="#E2574C" className="fruit" />
          </g>
        ))}
        {/* light sweeping across the glass */}
        <rect className="shine" x="-60" y="50" width="50" height="180" fill="url(#shine)" transform="skewX(-20)" />
      </g>

      {/* frame */}
      <g fill="none" stroke="var(--frame)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M90 215V120L200 60L310 120V215" strokeWidth="5" />
        <path d="M90 120H310" strokeWidth="3" />
        <path d="M90 165H310" strokeWidth="2" />
        <path d="M145 215V90M255 215V90M200 60V160" strokeWidth="2.5" />
        {/* door */}
        <path d="M180 215V160H220V215" strokeWidth="3" />
        <path d="M200 160V215" strokeWidth="1.5" />
      </g>
      <circle cx="194" cy="190" r="1.8" fill="var(--frame)" />
      <circle cx="206" cy="190" r="1.8" fill="var(--frame)" />

      {/* ground line */}
      <path d="M40 215H360" stroke="var(--frame)" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  )
}
