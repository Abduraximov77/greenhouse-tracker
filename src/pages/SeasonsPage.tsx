import { useState } from 'react'
import { addRecord, seasonLabel, useDB } from '../lib/store'
import { href } from '../lib/router'
import { FormCard, Field, PageHead } from '../components/ui'

export function SeasonsPage() {
  const db = useDB()
  const seasons = [...db.seasons].sort((a, b) => a.startYear - b.startYear)
  const [adding, setAdding] = useState(false)
  const nextYear = seasons.length ? Math.max(...seasons.map((s) => s.startYear)) + 1 : new Date().getFullYear()
  const [year, setYear] = useState(String(nextYear))
  const [error, setError] = useState<string | null>(null)
  const thisYear = new Date().getFullYear()

  function openAdd() {
    setYear(String(nextYear))
    setError(null)
    setAdding(true)
  }

  function submit() {
    const y = Number(year)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return setError('Enter a year like 2028.')
    if (seasons.some((s) => s.startYear === y)) return setError(`The ${y}–${y + 1} season already exists.`)
    addRecord('seasons', { startYear: y })
    setAdding(false)
  }

  return (
    <>
      <PageHead
        title="Seasons"
        sub="Choose a season to see its crops, workers and records."
        actions={
          !adding && (
            <button className="btn btn-primary" onClick={openAdd}>
              + New season
            </button>
          )
        }
      />

      {adding && (
        <FormCard
          title="New season"
          submitLabel="Create season"
          onCancel={() => setAdding(false)}
          onSubmit={submit}
          error={error}
        >
          <Field label="Season starts in year" hint={`Creates the ${year || '…'}–${Number(year) + 1 || '…'} season`}>
            <input
              className="input"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </Field>
        </FormCard>
      )}

      <div className="season-grid">
        {seasons.map((s) => {
          const crops = db.crops.filter((c) => c.seasonId === s.id)
          const workers = db.workers.filter((w) => w.seasonId === s.id)
          const status = s.startYear < thisYear ? 'Past' : s.startYear === thisYear ? 'Current' : 'Upcoming'
          return (
            <a key={s.id} className="card season-card" href={href('season', s.id)}>
              <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
              <span className="season-year">{seasonLabel(s)}</span>
              <span className="season-meta">
                {crops.length ? crops.map((c) => c.crop).join(', ') : 'No crops yet'}
              </span>
              <span className="season-foot">
                <span>
                  {crops.length} crop{crops.length === 1 ? '' : 's'} · {workers.length} worker
                  {workers.length === 1 ? '' : 's'}
                </span>
                <span className="season-open" aria-hidden="true">
                  →
                </span>
              </span>
            </a>
          )
        })}
      </div>
    </>
  )
}
