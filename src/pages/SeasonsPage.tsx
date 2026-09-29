import { useState } from 'react'
import { addRecord, seasonLabel, useDB } from '../lib/store'
import { href } from '../lib/router'
import { cropName } from '../lib/crops'
import { useT } from '../lib/i18n'
import { FormCard, Field, PageHead } from '../components/ui'
import { WeatherCard } from '../components/Weather'

export function SeasonsPage() {
  const db = useDB()
  const t = useT()
  const lang = db.settings.lang
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
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return setError(t('Enter a year like 2028.'))
    if (seasons.some((s) => s.startYear === y)) return setError(t('The {season} season already exists.', { season: String(y) }))
    addRecord('seasons', { startYear: y })
    setAdding(false)
  }

  return (
    <>
      <PageHead
        title={t('Seasons')}
        sub={t('Choose a season to see its crops and records.')}
        actions={
          !adding && (
            <button className="btn btn-primary" onClick={openAdd}>
              + {t('New season')}
            </button>
          )
        }
      />

      <WeatherCard />

      {adding && (
        <FormCard
          title={t('New season')}
          submitLabel={t('Create season')}
          onCancel={() => setAdding(false)}
          onSubmit={submit}
          error={error}
        >
          <Field label={t('Season year')} hint={t('Creates the {season} season', { season: year || '…' })}>
            <input
              id="season-year"
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
          const workerIds = new Set(
            Object.values(db.attendance)
              .filter((a) => a.seasonId === s.id)
              .map((a) => a.workerId),
          )
          const status = s.startYear < thisYear ? 'Past' : s.startYear === thisYear ? 'Current' : 'Upcoming'
          return (
            <a key={s.id} className="card season-card" href={href('season', s.id)}>
              <span className={`badge badge-${status.toLowerCase()}`}>{t(status)}</span>
              <span className="season-year">{seasonLabel(s)}</span>
              <span className="season-meta">{crops.length ? crops.map((c) => cropName(c.crop, lang)).join(', ') : t('No crops yet')}</span>
              <span className="season-foot">
                <span>
                  {t('Crops: {n}', { n: crops.length })} · {t('Workers: {n}', { n: workerIds.size })}
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
