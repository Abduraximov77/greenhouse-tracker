import { useEffect, useState } from 'react'
import { LoadingScreen } from './components/LoadingScreen'
import { Logo } from './components/Logo'
import { Empty } from './components/ui'
import { CURRENCIES } from './lib/format'
import { href, usePath } from './lib/router'
import { setCurrency, useDB } from './lib/store'
import { SeasonsPage } from './pages/SeasonsPage'
import { SeasonPage } from './pages/SeasonPage'
import { CropPage } from './pages/CropPage'
import { WorkersPage } from './pages/WorkersPage'

// How long the loading screen shows at minimum, so it doesn't just flash.
const MIN_SPLASH_MS = 2100
const FADE_MS = 600

export default function App() {
  const [phase, setPhase] = useState<'loading' | 'leaving' | 'done'>('loading')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('leaving'), MIN_SPLASH_MS)
    const t2 = setTimeout(() => setPhase('done'), MIN_SPLASH_MS + FADE_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  return (
    <>
      {phase !== 'done' && <LoadingScreen leaving={phase === 'leaving'} />}
      <div className="app" aria-hidden={phase !== 'done'}>
        <Header />
        <main className="content">
          <Routes />
        </main>
      </div>
    </>
  )
}

function Header() {
  const db = useDB()
  return (
    <header className="topbar">
      <a href={href()} className="logo-link" aria-label="AgroLedger home">
        <Logo size={36} />
      </a>
      <label className="currency">
        <span className="sr-only">Currency</span>
        <select className="input input-compact" value={db.settings.currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </header>
  )
}

function Routes() {
  const db = useDB()
  const path = usePath()
  const [first, seasonId, sub, cropId, tab] = path

  if (!first) return <SeasonsPage />

  const season = first === 'season' ? db.seasons.find((s) => s.id === seasonId) : undefined
  if (!season) return <NotFound />

  if (!sub) return <SeasonPage season={season} />
  if (sub === 'workers') return <WorkersPage season={season} />
  if (sub === 'crop') {
    const crop = db.crops.find((c) => c.id === cropId && c.seasonId === season.id)
    if (crop) return <CropPage key={crop.id} season={season} crop={crop} tab={tab ?? 'overview'} />
  }
  return <NotFound />
}

function NotFound() {
  return (
    <Empty title="This page doesn't exist">
      It may have been deleted. <a href={href()}>Go to seasons</a>
    </Empty>
  )
}
