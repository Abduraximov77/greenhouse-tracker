import { useEffect, useState } from 'react'
import { setPlace, updateRecord, useDB, type Lang, type Place, type SeasonCrop } from '../lib/store'
import { cropName } from '../lib/crops'
import { useT, type T } from '../lib/i18n'
import { href } from '../lib/router'
import { formatDate, formatNumber, todayISO } from '../lib/format'
import {
  cropPlace,
  dayOfCrop,
  farmPlaces,
  samePlace,
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

/** Places saved from GPS before the town name was looked up: find the name once (e.g. "Kunshan"). */
function useNameLookup(place: Place | null | undefined, save: (p: Place) => void) {
  const lang = useDB().settings.lang
  useEffect(() => {
    if (!place || place.source !== 'gps' || !DEFAULT_PLACE_NAMES.includes(place.name)) return
    let alive = true
    void placeName(place.lat, place.lon, lang).then((name) => {
      if (alive && name) save({ ...place, name })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, lang])
}

/** Weather on the first page: one tab per place of the farm, each with now, 7 days and warnings. */
export function WeatherCard() {
  const db = useDB()
  const t = useT()
  const places = farmPlaces(db)
  const [pick, setPick] = useState(0)
  const place = places[Math.min(pick, places.length - 1)] ?? null
  useNameLookup(db.settings.place, setPlace)

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

  const cropsHere = db.crops.filter((c) => samePlace(cropPlace(db, c), place))
  const seasonYear = (id: string) => db.seasons.find((s) => s.id === id)?.startYear ?? 0
  const latest = Math.max(0, ...cropsHere.map((c) => seasonYear(c.seasonId)))
  const names = [...new Set(cropsHere.filter((c) => seasonYear(c.seasonId) === latest).map((c) => cropName(c.crop, db.settings.lang)))]

  return (
    <section className="card wx-card" aria-label={t('Weather')}>
      {places.length > 1 && (
        <div className="wx-tabs" role="tablist" aria-label={t('Places')}>
          {places.map((p, i) => (
            <PlaceTab key={`${p.lat},${p.lon}`} place={p} active={p === place} onClick={() => setPick(i)} />
          ))}
        </div>
      )}
      <PlaceWeather key={`${place.lat},${place.lon}`} place={place} crops={names} />
    </section>
  )
}

function PlaceTab({ place, active, onClick }: { place: Place; active: boolean; onClick: () => void }) {
  const t = useT()
  const { data } = useForecast(place)
  const warn = data ? weatherWarnings(data) : []
  const danger = warn.some((w) => w.level === 'danger')
  return (
    <button type="button" role="tab" aria-selected={active} className={`wx-tab${active ? ' is-on' : ''}`} onClick={onClick}>
      📍 {place.name}
      {warn.length > 0 && (
        <span className={`wx-tab-dot${danger ? ' wx-tab-danger' : ''}`} title={t('Weather warnings')}>
          ⚠ {warn.length}
        </span>
      )}
    </button>
  )
}

function PlaceWeather({ place, crops }: { place: Place; crops: string[] }) {
  const t = useT()
  const lang = useDB().settings.lang
  const { data, loading, error } = useForecast(place)
  const warnings = data ? weatherWarnings(data) : []
  return (
    <>
      <div className="wx-head">
        <div>
          <p className="wx-title">
            {t('Weather')} · {place.name}
            {crops.length > 0 && <span className="wx-crops"> · {crops.join(', ')}</span>}
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
          {t('Places')}
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
    </>
  )
}

/** Only the warnings for where this crop grows, for its overview. Shows nothing when all is calm. */
export function WeatherWarningsBanner({ crop }: { crop: SeasonCrop }) {
  const t = useT()
  const db = useDB()
  const place = cropPlace(db, crop)
  const { data } = useForecast(place)
  if (!place || !data) return null
  const warnings = weatherWarnings(data)
  if (!warnings.length) return null
  return (
    <div className="card wx-card wx-banner" role="status">
      <p className="wx-title">
        ⚠ {t('Weather warnings')} · 📍 {place.name}
      </p>
      <WarningList warnings={warnings} />
    </div>
  )
}

/** Pick a place: from this phone's GPS, or by searching a town name. Also lets the name be changed. */
export function PlaceEditor({
  place,
  onChange,
  idPrefix,
  removable = true,
}: {
  place: Place | null
  onChange: (p: Place | null) => void
  idPrefix: string
  removable?: boolean
}) {
  const db = useDB()
  const t = useT()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [busy, setBusy] = useState<null | 'gps' | 'search'>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useNameLookup(place, onChange)

  async function useGps() {
    setBusy('gps')
    setMsg(null)
    try {
      const { lat, lon } = await locateDevice()
      const name = (await placeName(lat, lon, db.settings.lang)) ?? (place?.name || t('My farm'))
      onChange({ name, lat, lon, source: 'gps' })
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
    <div className="place-editor">
      {place && (
        <div className="loc-saved">
          <span aria-hidden="true">📍</span>
          <div>
            <label className="field-label" htmlFor={`${idPrefix}-name`}>
              {t('Place name')}
            </label>
            <input
              id={`${idPrefix}-name`}
              className="input"
              value={place.name}
              onChange={(e) => onChange({ ...place, name: e.target.value })}
            />
            <span className="field-hint">
              {formatNumber(place.lat, 4)}, {formatNumber(place.lon, 4)} · {place.source === 'gps' ? t('from the phone') : t('from search')}
            </span>
          </div>
          {removable && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => onChange(null)}>
              {t('Remove')}
            </button>
          )}
        </div>
      )}

      <div className="loc-actions">
        <button type="button" className="btn btn-primary" onClick={useGps} disabled={busy !== null}>
          📍 {busy === 'gps' ? t('Finding…') : place ? t('Update from this phone') : t('Use this phone’s location')}
        </button>
        <div className="loc-search">
          <input
            id={`${idPrefix}-search`}
            className="input"
            placeholder={t('Or type a town or district, e.g. Chirchiq')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void search()
              }
            }}
            aria-label={t('Search for a place')}
          />
          <button type="button" className="btn btn-ghost" onClick={() => void search()} disabled={busy !== null || q.trim().length < 2}>
            {busy === 'search' ? t('Searching…') : t('Search')}
          </button>
        </div>
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
                  onChange({ name: r.name, lat: r.lat, lon: r.lon, source: 'search' })
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

/** Settings: the farm's main place, and the other places its crops are in. */
export function LocationSettings() {
  const db = useDB()
  const t = useT()
  const main = db.settings.place ?? null
  const others = farmPlaces(db).filter((p) => !samePlace(p, main))
  return (
    <div className="card settings-card" id="location">
      <p className="field-label">{t('Main place')}</p>
      <p className="field-hint">{t('Used for crops that have no place of their own. Only the place is saved, nothing else.')}</p>
      <PlaceEditor place={main} onChange={setPlace} idPrefix="loc" />
      {others.length > 0 && (
        <div className="loc-others">
          <p className="field-label">{t('Other places (set on each crop)')}</p>
          <ul>
            {others.map((p) => {
              const crops = db.crops.filter((c) => samePlace(c.place, p))
              return (
                <li key={`${p.lat},${p.lon}`}>
                  📍 <b>{p.name}</b> — {crops.map((c) => cropName(c.crop, db.settings.lang)).join(', ')}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Choose where a crop grows: one of the farm's places, or a new one.
 * value null = the main place.
 */
export function PlaceChoice({ value, onChange, idPrefix }: { value: Place | null; onChange: (p: Place | null) => void; idPrefix: string }) {
  const db = useDB()
  const t = useT()
  const main = db.settings.place ?? null
  const known = farmPlaces(db)
  const isKnown = !value || known.some((p) => samePlace(p, value))
  const [adding, setAdding] = useState(!isKnown)
  const [draft, setDraft] = useState<Place | null>(isKnown ? null : value)

  return (
    <div className="place-choice">
      <div className="place-chips" role="radiogroup" aria-label={t('Where is it?')}>
        {known.map((p) => {
          const on = !adding && (value ? samePlace(p, value) : samePlace(p, main))
          return (
            <button
              key={`${p.lat},${p.lon}`}
              type="button"
              role="radio"
              aria-checked={on}
              className={`place-chip${on ? ' is-on' : ''}`}
              onClick={() => {
                setAdding(false)
                onChange(samePlace(p, main) ? null : p)
              }}
            >
              📍 {p.name}
              {samePlace(p, main) && <small> · {t('main')}</small>}
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={adding}
          className={`place-chip${adding ? ' is-on' : ''}`}
          onClick={() => {
            setAdding(true)
            onChange(draft)
          }}
        >
          + {t('Another place')}
        </button>
      </div>
      {adding && (
        <PlaceEditor
          place={draft}
          onChange={(p) => {
            setDraft(p)
            onChange(p)
          }}
          idPrefix={idPrefix}
          removable={false}
        />
      )}
      {!known.length && !adding && (
        <p className="field-hint">{t('No place yet. Add one so the weather and warnings are for this crop.')}</p>
      )}
    </div>
  )
}

/** Crop side panel: "📍 Kunshan", with a way to change it. */
export function CropPlace({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<Place | null>(crop.place ?? null)
  const place = cropPlace(db, crop)

  if (editing) {
    return (
      <div className="planted planted-edit">
        <span className="field-label">{t('Where is it?')}</span>
        <PlaceChoice value={value} onChange={setValue} idPrefix={`cp-${crop.id}`} />
        <div className="planted-btns">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => {
              // a place equal to the main one is stored as "main", so moving the main place moves this crop too
              updateRecord('crops', crop.id, { place: value && !samePlace(value, db.settings.place) ? value : null })
              setEditing(false)
            }}
          >
            {t('Save')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="planted">
      <span className="planted-date">
        📍 {place ? <b className="crop-place-name">{place.name}</b> : t('No place set')}{' '}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setValue(crop.place ?? null)
            setEditing(true)
          }}
        >
          {place ? t('Change') : t('Set')}
        </button>
      </span>
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
