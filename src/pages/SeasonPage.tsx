import { useMemo, useState } from 'react'
import { addRecord, removeRecord, seasonLabel, useDB, type Season } from '../lib/store'
import { href, navigate } from '../lib/router'
import { CROP_CATALOG } from '../lib/crops'
import { formatNumber, useMoney } from '../lib/format'
import { Breadcrumbs, DeleteButton, Empty, Field, FormCard, PageHead, SectionHead, num } from '../components/ui'
import { cropTotals } from './cropTotals'

export function SeasonPage({ season }: { season: Season }) {
  const db = useDB()
  const money = useMoney()
  const crops = db.crops.filter((c) => c.seasonId === season.id)
  const workers = db.workers.filter((w) => w.seasonId === season.id)

  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [variety, setVariety] = useState('')
  const [area, setArea] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return CROP_CATALOG.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8)
  }, [query])
  const exact = CROP_CATALOG.some((c) => c.name.toLowerCase() === query.trim().toLowerCase())

  function pick(name: string) {
    setPicked(name)
    setVariety('')
    setArea('')
    setQuery('')
  }

  function addCrop() {
    if (!picked) return
    const rec = addRecord('crops', {
      seasonId: season.id,
      crop: picked,
      variety: variety.trim(),
      areaHa: num(area),
    })
    setPicked(null)
    navigate('season', season.id, 'crop', rec.id)
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Seasons', to: [] }, { label: seasonLabel(season) }]} />
      <PageHead title={`${seasonLabel(season)} season`} sub="Crops you grow this season, and your workers." />

      {/* ---------- crop search ---------- */}
      {!picked && (
        <div className="card search-card">
          <label className="field-label" htmlFor="crop-search">
            Add a crop to this season
          </label>
          <div className="search-wrap">
            <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              id="crop-search"
              className="input search-input"
              placeholder="Search crops, e.g. tomato"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          {query.trim() && (
            <ul className="search-results" role="listbox">
              {results.map((c) => {
                const already = crops.some((x) => x.crop === c.name)
                return (
                  <li key={c.name}>
                    <button type="button" className="search-item" onClick={() => pick(c.name)}>
                      <span>
                        <span className="search-name">{c.name}</span>
                        <span className="search-group">{c.group}</span>
                      </span>
                      <span className="search-tag">{already ? 'Already added · add again' : 'Add'}</span>
                    </button>
                  </li>
                )
              })}
              {!exact && (
                <li>
                  <button type="button" className="search-item" onClick={() => pick(query.trim())}>
                    <span>
                      <span className="search-name">“{query.trim()}”</span>
                      <span className="search-group">Not in the list: add as a new crop</span>
                    </span>
                    <span className="search-tag">Add</span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {picked && (
        <FormCard
          title={`Add ${picked} to ${seasonLabel(season)}`}
          submitLabel="Add crop"
          onCancel={() => setPicked(null)}
          onSubmit={addCrop}
        >
          <Field label="Variety (optional)" hint="e.g. Pink Paradise F1">
            <input className="input" value={variety} onChange={(e) => setVariety(e.target.value)} />
          </Field>
          <Field label="Growing area, hectares (optional)" hint="Used to calculate fertilizer totals">
            <input className="input" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
          </Field>
        </FormCard>
      )}

      {/* ---------- crops ---------- */}
      <SectionHead title="Crops" />
      {crops.length === 0 ? (
        <Empty title="No crops in this season yet">Search above to add the first one.</Empty>
      ) : (
        <div className="crop-grid">
          {crops.map((c) => {
            const t = cropTotals(db, c.id)
            return (
              <a key={c.id} className="card crop-card" href={href('season', season.id, 'crop', c.id)}>
                <span className="crop-name">{c.crop}</span>
                <span className="crop-variety">
                  {[c.variety, c.areaHa ? `${formatNumber(c.areaHa)} ha` : ''].filter(Boolean).join(' · ') ||
                    'No variety set'}
                </span>
                <span className="crop-stats">
                  <span>
                    <b>{formatNumber(t.boxesHarvested, 0)}</b> boxes harvested
                  </span>
                  <span>
                    <b>{formatNumber(t.boxesInStock, 0)}</b> in stock
                  </span>
                  <span>
                    <b>{money(t.totalCost)}</b> costs
                  </span>
                </span>
              </a>
            )
          })}
        </div>
      )}

      {/* ---------- workers ---------- */}
      <SectionHead title="Workers" />
      <a className="card link-card" href={href('season', season.id, 'workers')}>
        <span>
          <span className="crop-name">Workers & salaries</span>
          <span className="crop-variety">
            {workers.length
              ? `${workers.length} worker${workers.length === 1 ? '' : 's'}: days on/off and daily salary`
              : 'Add workers, mark days on and off, see salaries'}
          </span>
        </span>
        <span className="season-open" aria-hidden="true">
          →
        </span>
      </a>

      <div className="danger-zone">
        <DeleteButton
          label="Delete this season"
          onDelete={() => {
            removeRecord('seasons', season.id)
            navigate()
          }}
        />
        <span className="field-hint">Deletes all crops, records and workers in this season.</span>
      </div>
    </>
  )
}
