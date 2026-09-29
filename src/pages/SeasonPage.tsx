import { useMemo, useState } from 'react'
import { addRecord, seasonLabel, setPlace, useDB, type Place, type Season } from '../lib/store'
import { PlaceChoice } from '../components/Weather'
import { cropPlace } from '../lib/weather'
import { href, navigate } from '../lib/router'
import { CROP_CATALOG, cropName } from '../lib/crops'
import { formatNumber, todayISO } from '../lib/format'
import { useCurrency } from '../lib/money'
import { useT } from '../lib/i18n'
import { Breadcrumbs, Empty, Field, FormCard, PageHead, SectionHead, num } from '../components/ui'
import { cropTotals } from './cropTotals'

export function SeasonPage({ season }: { season: Season }) {
  const db = useDB()
  const t = useT()
  const lang = db.settings.lang
  const { fmt: money } = useCurrency()
  const crops = db.crops.filter((c) => c.seasonId === season.id)

  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [variety, setVariety] = useState('')
  const [area, setArea] = useState('')
  const [place, setCropPlace] = useState<Place | null>(null)
  const [planted, setPlanted] = useState('')

  // Search matches the crop name in any of the three languages.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return CROP_CATALOG.filter((c) => [c.name, c.ru, c.uz].some((n) => n.toLowerCase().includes(q))).slice(0, 8)
  }, [query])
  const exact = CROP_CATALOG.some((c) => [c.name, c.ru, c.uz].some((n) => n.toLowerCase() === query.trim().toLowerCase()))

  function pick(name: string) {
    setPicked(name)
    setVariety('')
    setArea('')
    setCropPlace(null)
    setPlanted('')
    setQuery('')
  }

  function addCrop() {
    if (!picked) return
    // The first place ever set becomes the farm's main place.
    let own = place
    if (own && !db.settings.place) {
      setPlace(own)
      own = null
    }
    const rec = addRecord('crops', {
      seasonId: season.id,
      crop: picked,
      variety: variety.trim(),
      areaHa: num(area),
      place: own,
      plantedAt: planted || null,
    })
    setPicked(null)
    navigate('season', season.id, 'crop', rec.id)
  }

  return (
    <>
      <Breadcrumbs items={[{ label: t('Seasons'), to: [] }, { label: seasonLabel(season) }]} />
      <PageHead
        title={t('{season} season', { season: seasonLabel(season) })}
        sub={t('Crops you grow this season. Open a crop to record its work.')}
      />

      {!picked && (
        <div className="card search-card">
          <label className="field-label" htmlFor="crop-search">
            {t('Add a crop to this season')}
          </label>
          <div className="search-wrap">
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              id="crop-search"
              className="input search-input"
              placeholder={t('Search crops, e.g. tomato')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          {query.trim() && (
            <ul className="search-results">
              {results.map((c) => {
                const already = crops.some((x) => x.crop === c.name)
                return (
                  <li key={c.name}>
                    <button type="button" className="search-item" onClick={() => pick(c.name)}>
                      <span>
                        <span className="search-name">{cropName(c.name, lang)}</span>
                        <span className="search-group">{t(c.group)}</span>
                      </span>
                      <span className="search-tag">{already ? t('Already added · add again') : t('Add')}</span>
                    </button>
                  </li>
                )
              })}
              {!exact && (
                <li>
                  <button type="button" className="search-item" onClick={() => pick(query.trim())}>
                    <span>
                      <span className="search-name">“{query.trim()}”</span>
                      <span className="search-group">{t('Not in the list: add as a new crop')}</span>
                    </span>
                    <span className="search-tag">{t('Add')}</span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {picked && (
        <FormCard
          title={t('Add {crop} to {season}', { crop: cropName(picked, lang), season: seasonLabel(season) })}
          submitLabel={t('Add crop')}
          onCancel={() => setPicked(null)}
          onSubmit={addCrop}
        >
          <Field label={t('Variety (optional)')} hint={t('e.g. Pink Paradise F1')}>
            <input id="crop-variety" className="input" value={variety} onChange={(e) => setVariety(e.target.value)} />
          </Field>
          <Field label={t('Growing area, hectares (optional)')} hint={t('Used to calculate fertilizer totals')}>
            <input id="crop-area" className="input" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
          </Field>
          <Field label={t('Seedlings planted on (optional)')} hint={t('Shows how many days the crop has been in the ground')}>
            <input
              id="crop-planted"
              className="input"
              type="date"
              value={planted}
              max={todayISO()}
              onChange={(e) => setPlanted(e.target.value)}
            />
          </Field>
          <div className="field field-wide">
            <span className="field-label">{t('Where is it?')}</span>
            <PlaceChoice value={place} onChange={setCropPlace} idPrefix="crop-place" />
            <span className="field-hint">{t('The weather, warnings and advice for this crop use this place.')}</span>
          </div>
        </FormCard>
      )}

      <SectionHead title={t('Crops')} />
      {crops.length === 0 ? (
        <Empty title={t('No crops in this season yet')}>{t('Search above to add the first one.')}</Empty>
      ) : (
        <div className="crop-grid">
          {crops.map((c) => {
            const tt = cropTotals(db, c.id)
            return (
              <a key={c.id} className="card crop-card" href={href('season', season.id, 'crop', c.id)}>
                <span className="crop-name">{cropName(c.crop, lang)}</span>
                <span className="crop-variety">
                  {[
                    c.variety,
                    c.areaHa ? `${formatNumber(c.areaHa)} ${t('ha')}` : '',
                    cropPlace(db, c) ? `📍 ${cropPlace(db, c)!.name}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || t('No variety set')}
                </span>
                <span className="crop-stats">
                  <span>
                    {t('Boxes harvested')}: <b>{formatNumber(tt.boxesHarvested, 0)}</b>
                  </span>
                  <span>
                    {t('Boxes in stock')}: <b>{formatNumber(tt.boxesInStock, 0)}</b>
                  </span>
                  <span>
                    {t('Costs')}: <b>{money(tt.totalCost)}</b>
                  </span>
                </span>
              </a>
            )
          })}
        </div>
      )}
    </>
  )
}
