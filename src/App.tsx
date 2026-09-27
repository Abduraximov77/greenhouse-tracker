import { useEffect, useState } from 'react'
import { LoadingScreen } from './components/LoadingScreen'
import { Logo, LogoMark } from './components/Logo'

// How long the loading screen shows at minimum, so the animation can be seen.
const MIN_SPLASH_MS = 2100
const FADE_MS = 600

export default function App() {
  const [phase, setPhase] = useState<'loading' | 'leaving' | 'done'>('loading')

  useEffect(() => {
    // Later, real data loading will happen here; for now we just wait.
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
        <header className="topbar">
          <Logo size={38} />
        </header>
        <main className="content">
          <section className="welcome">
            <LogoMark size={72} />
            <h2>Welcome to AgroLedger</h2>
            <p>
              This is where you'll record everything happening in the greenhouse. Tracking
              sections will appear here as we add them, one by one.
            </p>
          </section>
          <section className="empty-grid" aria-label="Tracking sections">
            <div className="empty-card">
              <span className="empty-plus">+</span>
              <span>No tracking sections yet</span>
            </div>
          </section>
        </main>
      </div>
    </>
  )
}
