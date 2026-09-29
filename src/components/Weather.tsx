import { useEffect, useState } from 'react'
import { setPlace, updateRecord, useDB, type Lang, type SeasonCrop } from '../lib/store'
import { useT, type T } from '../lib/i18n'
import { href } from '../lib/router'
import { formatDate, formatNumber, todayISO } from '../lib/format'
import {
  dayOfCrop,
  DEFAULT_PLACE_NAMES,
  locateDevice,
  placeName,
  searchPlaces,
  useForecast,
  weatherLook,
  weatherWarnings,
  type DayWeather,
  type PlaceResult,
  type WeatherWarning,
} from '../lib/weather'

const SHORT_DAYS: Record<Lang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
  uz: ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'],
}

function dayName(iso: string, lang: Lang, t: T) {
  const today = todayISO()
  if (iso === today) return t('Today')
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dt.toDateString() === tomorrow.toDateString()) return t('Tomorrow')
  return `${SHORT_DAYS[lang][dt.getDay()]} ${d}`
}

const deg = (n: number) => `${Math.round(n)}°`

/** What to do about each kind of weather in a greenhouse. */
function warningText(w: WeatherWarning, t: T) {
  const v = Math.round(w.value)
  switch (w.kind) {
    case 'frost':
      return t('Frost, down to {v}°C. Close the greenhouse and keep it heated at night.', { v })
    case 'cold':
      return t('Cold night, {v}°C. Close vents and doors in the evening.', { v })
    case 'heat':
      return t('Heat, up to {v}°C. Open vents early, shade the plants, water in the morning.', { v })
    case 'wind':
      return t('Strong wind, gusts up to {v} km/h. Close vents and tie down the film.', { v })
    case 'rain':
      return t('Heavy rain, {v} mm. Check the film and drains, close vents.', { v })
    case 'storm':
      return t('Thunderstorm, hail is possible. Secure the film and close vents.')
    case 'snow':
      return t('Snow expected. Clear snow from the roof so the film does not tear.')
  }
}

function WarningList({ warnings }: { warnings: WeatherWarning[] }) {
  const t = useT()
  const lang = useDB().settings.lang
  return (
    <ul className="wx-warnings">
      {warnings.map((w, i) => (
        <li key={i} className={`wx-warning wx-${w.level}`}>
          <span className="wx-warning-day">{i > 0 && warnings[i - 1].date === w.date ? '' : dayName(w.date, lang, t)}</span>
          <span>{warningText(w, t)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Weather on the first page: now, the next 7 days, and warnings. */
export function WeatherCard() {
  const db = useDB()
  const t = useT()
  const place = db.settings.place
  const { data, loading, error } = useForecast(place)
  const lang = db.settings.lang

  // Places saved from GPS before the town name was looked up: find the name once (e.g. "Kunshan").
  useEffect(() => {
    if (!place || place.source !== 'gps' || !DEFAULT_PLACE_NAMES.includes(place.name)) return
    let alive = true
    void placeName(place.lat, place.lon, lang).then((name) => {
      if (alive && name) setPlace({ ...place, name })
    })
    return () => {
      alive = false
    }
  }, [place, lang])

  if (!place) {
    return (
      <div className="card wx-card wx-empty">
        <span className="wx-empty-icon" aria-hidden="true">
          🌤️
        </span>
        <div>
          <p className="wx-title">{t('Weather and warnings')}</p>
          <p className="field-hint">{t('Set where your farm is to see the forecast and warnings about frost, heat, wind and rain.')}</p>
        </div>
        <a className="btn btn-primary btn-small" href={href('settings', 'location')}>
          {t('Set location')}
        </a>
      </div>
    )
  }

  const warnings = data ? weatherWarnings(data) : []
  return (
    <section className="card wx-card" aria-label={t('Weather')}>
      <div className="wx-head">
        <div>
          <p className="wx-title">
            {t('Weather')} · {place.name}
          </p>
          {data ? (
            <p className="wx-now">
              <span aria-hidden="true">{weatherLook(data.now.code).icon}</span> <b>{deg(data.now.temp)}</b>{' '}
              {t(weatherLook(data.now.code).label)} · {t('wind {v} km/h', { v: Math.round(data.now.wind) })}
              {data.now.humidity !== null && ` · ${t('humidity {v}%', { v: data.now.humidity })}`}
            </p>
          ) : (
            <p className="field-hint">{loading ? t('Loading the forecast…') : t('The forecast could not be loaded.')}</p>
          )}
        </div>
        <a className="wx-place-link" href={href('settings', 'location')}>
          {t('Change')}
        </a>
      </div>

      {data && (
        <div className="wx-days" role="list">
          {data.days.map((d: DayWeather) => {
            const look = weatherLook(d.code)
            return (
              <div key={d.date} className="wx-day" role="listitem" title={t(look.label)}>
                <span className="wx-day-name">{dayName(d.date, lang, t)}</span>
                <span className="wx-day-icon" aria-hidden="true">
                  {look.icon}
                </span>
                <span className="wx-day-temp">
                  <b>{deg(d.tMax)}</b> <span>{deg(d.tMin)}</span>
                </span>
                <span className="wx-day-rain">{d.rain >= 0.5 ? `${formatNumber(d.rain, 0)} mm` : ' '}</span>
                <span className="sr-only">{t(look.label)}</span>
              </div>
            )
          })}
        </div>
      )}

      {data &&
        (warnings.length > 0 ? (
          <WarningList warnings={warnings} />
        ) : (
          <p className="wx-ok">✓ {t('No weather warnings for the next 3 days.')}</p>
        ))}
      {error && data && <p className="field-hint">{t('Could not refresh; showing the last forecast.')}</p>}
    </section>
  )
}

/** Only the warnings, for a crop's overview. Shows nothing when all is calm. */
export function WeatherWarningsBanner() {
  const t = useT()
  const place = useDB().settings.place
  const { data } = useForecast(place)
  if (!place || !data) return null
  const warnings = weatherWarnings(data)
  if (!warnings.length) return null
  return (
    <div className="card wx-card wx-banner" role="status">
      <p className="wx-title">⚠ {t('Weather warnings')}</p>
      <WarningList warnings={warnings} />
    </div>
  )
}

/** Settings: where the farm is. GPS from the phone, or search by town name. */
export function LocationSettings() {
  const db = useDB()
  const t = useT()
  const place = db.settings.place
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [busy, setBusy] = useState<null | 'gps' | 'search'>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function useGps() {
    setBusy('gps')
    setMsg(null)
    try {
      const { lat, lon } = await locateDevice()
      const name = (await placeName(lat, lon, db.settings.lang)) ?? (place?.name || t('My farm'))
      setPlace({ name, lat, lon, source: 'gps' })
      setResults(null)
      setMsg(t('Location saved from your phone.'))
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1
      setMsg(
        denied
          ? t('Location access was not allowed. Allow it in the browser, or search by town name.')
          : t('Could not get the location. Try again, or search by town name.'),
      )
    } finally {
      setBusy(null)
    }
  }

  async function search() {
    if (q.trim().length < 2) return
    setBusy('search')
    setMsg(null)
    try {
      const r = await searchPlaces(q.trim(), db.settings.lang)
      setResults(r)
      if (!r.length) setMsg(t('Nothing found. Try the nearest town or district.'))
    } catch {
      setMsg(t('Search is not available right now. Check the internet.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card settings-card" id="location">
      {place ? (
        <div className="loc-saved">
          <span aria-hidden="true">📍</span>
          <div>
            <label className="field-label" htmlFor="loc-name">
              {t('Place name')}
            </label>
            <input id="loc-name" className="input" value={place.name} onChange={(e) => setPlace({ ...place, name: e.target.value })} />
            <span className="field-hint">
              {formatNumber(place.lat, 4)}, {formatNumber(place.lon, 4)} · {place.source === 'gps' ? t('from the phone') : t('from search')}
            </span>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setPlace(null)}>
            {t('Remove')}
          </button>
        </div>
      ) : (
        <p className="field-hint">{t('Used for the weather forecast and warnings. Only the place is saved, nothing else.')}</p>
      )}

      <div className="loc-actions">
        <button type="button" className="btn btn-primary" onClick={useGps} disabled={busy !== null}>
          📍 {busy === 'gps' ? t('Finding…') : place ? t('Update from this phone') : t('Use this phone’s location')}
        </button>
        <form
          className="loc-search"
          onSubmit={(e) => {
            e.preventDefault()
            void search()
          }}
        >
          <input
            id="loc-search"
            className="input"
            placeholder={t('Or type a town or district, e.g. Chirchiq')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('Search for a place')}
          />
          <button type="submit" className="btn btn-ghost" disabled={busy !== null || q.trim().length < 2}>
            {busy === 'search' ? t('Searching…') : t('Search')}
          </button>
        </form>
      </div>

      {msg && (
        <p className="field-hint" role="status">
          {msg}
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="search-results loc-results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                className="search-item"
                onClick={() => {
                  setPlace({ name: r.name, lat: r.lat, lon: r.lon, source: 'search' })
                  setResults(null)
                  setQ('')
                  setMsg(t('Location saved.'))
                }}
              >
                <span>
                  <span className="search-name">{r.name}</span>
                  <span className="search-group">{r.region}</span>
                </span>
                <span className="search-tag">{t('Choose')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "Planted 12 Aug 2026 · day 49", with a way to set or change the date. */
export function PlantedDate({ crop }: { crop: SeasonCrop }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(crop.plantedAt ?? '')
  const day = crop.plantedAt ? dayOfCrop(crop.plantedAt) : null

  if (editing) {
    return (
      <form
        className="planted planted-edit"
        onSubmit={(e) => {
          e.preventDefault()
          updateRecord('crops', crop.id, { plantedAt: value || null })
          setEditing(false)
        }}
      >
        <label className="field-label" htmlFor={`planted-${crop.id}`}>
          {t('Seedlings planted on')}
        </label>
        <input
          id={`planted-${crop.id}`}
          className="input"
          type="date"
          value={value}
          max={todayISO()}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="planted-btns">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn-primary btn-small">
            {t('Save')}
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="planted">
      {crop.plantedAt && day !== null ? (
        <>
          <span className="planted-day">{day > 0 ? t('Day {n}', { n: day }) : t('In {n} days', { n: -day })}</span>
          <span className="planted-date">
            {t('Planted {date}', { date: formatDate(crop.plantedAt) })}{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setValue(crop.plantedAt ?? '')
                setEditing(true)
              }}
            >
              {t('Change')}
            </button>
          </span>
        </>
      ) : (
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setValue('')
            setEditing(true)
          }}
        >
          + {t('Add planting date')}
        </button>
      )}
    </div>
  )
}
