import { useEffect, useState } from 'react'
import { LoadingScreen } from './components/LoadingScreen'
import { Logo } from './components/Logo'
import { Empty } from './components/ui'
import { CURRENCIES } from './lib/format'
import { LANGS, LOCALES, useT } from './lib/i18n'
import { href, usePath } from './lib/router'
import { currentSettings, setCurrency, setLang, useDB, type Lang } from './lib/store'
import { SeasonsPage } from './pages/SeasonsPage'
import { SeasonPage } from './pages/SeasonPage'
import { CropPage } from './pages/CropPage'
import { SettingsPage } from './pages/SettingsPage'
import { fetchRatesOnline, formatMoney } from './lib/money'

// How long the loading screen shows at minimum, so it doesn't just flash.
const MIN_SPLASH_MS = 2100
const FADE_MS = 600

export default function App() {
  const [phase, setPhase] = useState<'loading' | 'leaving' | 'done'>('loading')
  const lang = useDB().settings.lang

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('leaving'), MIN_SPLASH_MS)
    const t2 = setTimeout(() => setPhase('done'), MIN_SPLASH_MS + FADE_MS)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  // Refresh exchange rates online at most twice a day, unless they were typed in by hand.
  // (In a locked-down preview this request is blocked and nothing happens.)
  useEffect(() => {
    const s = currentSettings()
    const old = !s.ratesUpdatedAt || Date.now() - new Date(s.ratesUpdatedAt).getTime() > 12 * 3600 * 1000
    if (s.ratesSource !== 'manual' && old) void fetchRatesOnline()
  }, [])

  useEffect(() => {
    document.documentElement.lang = LOCALES[lang].slice(0, 2)
  }, [lang])

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
  const t = useT()
  const { rates, currency } = db.settings
  const other = currency === 'USD' ? 'UZS' : currency
  const rateText = rates[other] ? `1 USD = ${formatMoney(rates[other], other)}` : t('Set exchange rate')
  return (
    <header className="topbar">
      <a href={href()} className="logo-link" aria-label="AgroLedger">
        <Logo size={36} />
      </a>
      <div className="topbar-controls">
        <label className="control">
          <span className="sr-only">{t('Language')}</span>
          <svg className="control-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <select
            id="lang-select"
            className="input input-compact with-icon"
            value={db.settings.lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span className="sr-only">{t('Currency')}</span>
          <select
            id="currency-select"
            className="input input-compact"
            value={db.settings.currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <a className="rate-chip" href={href('settings')} title={t('Exchange rate and settings')}>
          <svg className="control-icon-inline" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="rate-text">{rateText}</span>
        </a>
      </div>
    </header>
  )
}

function Routes() {
  const db = useDB()
  const path = usePath()
  const [first, seasonId, sub, cropId, tab] = path

  if (!first) return <SeasonsPage />
  if (first === 'settings') return <SettingsPage />

  const season = first === 'season' ? db.seasons.find((s) => s.id === seasonId) : undefined
  if (!season) return <NotFound />

  if (!sub) return <SeasonPage season={season} />
  if (sub === 'crop') {
    const crop = db.crops.find((c) => c.id === cropId && c.seasonId === season.id)
    if (crop) return <CropPage key={crop.id} season={season} crop={crop} tab={tab ?? 'overview'} />
  }
  return <NotFound />
}

function NotFound() {
  const t = useT()
  return (
    <Empty title={t("This page doesn't exist")}>
      {t('It may have been deleted.')} <a href={href()}>{t('Go to seasons')}</a>
    </Empty>
  )
}
