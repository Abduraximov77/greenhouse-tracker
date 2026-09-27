import { useState } from 'react'
import { removeRecord, seasonLabel, updateRecord, useDB, type Season, type SeasonCrop } from '../lib/store'
import { href, navigate } from '../lib/router'
import { formatNumber, useMoney } from '../lib/format'
import { Breadcrumbs, DeleteButton, Field, FormCard, PageHead, SectionHead, Stat, num, str } from '../components/ui'
import { cropTotals } from './cropTotals'
import { PlantingSection } from './sections/PlantingSection'
import { NutritionSection } from './sections/NutritionSection'
import { HarvestSection } from './sections/HarvestSection'
import { ExportSection } from './sections/ExportSection'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'planting', label: 'Planting' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'harvest', label: 'Harvest' },
  { id: 'export', label: 'Export' },
] as const

export function CropPage({ season, crop, tab }: { season: Season; crop: SeasonCrop; tab: string }) {
  const active = TABS.some((t) => t.id === tab) ? tab : 'overview'
  const title = crop.variety ? `${crop.crop} · ${crop.variety}` : crop.crop

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Seasons', to: [] },
          { label: seasonLabel(season), to: ['season', season.id] },
          { label: crop.crop },
        ]}
      />
      <PageHead
        title={title}
        sub={`${seasonLabel(season)} season${crop.areaHa ? ` · ${formatNumber(crop.areaHa)} ha` : ''}`}
      />

      <nav className="tabs" aria-label="Crop sections">
        {TABS.map((t) => (
          <a
            key={t.id}
            className={`tab${active === t.id ? ' is-active' : ''}`}
            aria-current={active === t.id ? 'page' : undefined}
            href={href('season', season.id, 'crop', crop.id, t.id)}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {active === 'overview' && <Overview season={season} crop={crop} />}
      {active === 'planting' && <PlantingSection crop={crop} />}
      {active === 'nutrition' && <NutritionSection crop={crop} />}
      {active === 'harvest' && <HarvestSection crop={crop} />}
      {active === 'export' && <ExportSection crop={crop} />}
    </>
  )
}

function Overview({ season, crop }: { season: Season; crop: SeasonCrop }) {
  const db = useDB()
  const money = useMoney()
  const t = cropTotals(db, crop.id)
  const [editing, setEditing] = useState(false)
  const [variety, setVariety] = useState(crop.variety)
  const [area, setArea] = useState(str(crop.areaHa))

  const go = (tab: string) => navigate('season', season.id, 'crop', crop.id, tab)

  return (
    <>
      <SectionHead title="Harvest & export" />
      <div className="stat-grid">
        <Stat label="Boxes harvested" value={formatNumber(t.boxesHarvested, 0)} />
        <Stat label="Boxes exported" value={formatNumber(t.boxesExported, 0)} />
        <Stat
          label="Boxes in stock"
          value={formatNumber(t.boxesInStock, 0)}
          tone={t.boxesInStock < 0 ? 'warn' : t.boxesInStock > 0 ? 'good' : undefined}
        />
        <Stat label="Trucks sent" value={formatNumber(t.trucks, 0)} />
      </div>

      <SectionHead title="Costs" />
      <div className="stat-grid">
        <Stat label="Seedlings" value={money(t.plantingCost)} />
        <Stat label="Nutrition" value={money(t.nutritionCost)} />
        <Stat label="Delivery" value={money(t.deliveryCost)} />
        <Stat label="Total" value={money(t.totalCost)} />
      </div>
      <p className="field-hint">Worker salaries are counted for the whole season on the Workers page.</p>

      <SectionHead title="Record something" />
      <div className="quick-grid">
        <button className="quick" onClick={() => go('planting')}>
          <b>Planting</b>
          <span>Seedlings arrived or planted</span>
        </button>
        <button className="quick" onClick={() => go('nutrition')}>
          <b>Nutrition</b>
          <span>Fertilizer given</span>
        </button>
        <button className="quick" onClick={() => go('harvest')}>
          <b>Harvest</b>
          <span>Boxes packed today</span>
        </button>
        <button className="quick" onClick={() => go('export')}>
          <b>Export</b>
          <span>Truck loaded</span>
        </button>
      </div>

      <SectionHead
        title="Crop details"
        action={
          !editing && (
            <button
              className="btn btn-ghost btn-small"
              onClick={() => {
                setVariety(crop.variety)
                setArea(str(crop.areaHa))
                setEditing(true)
              }}
            >
              Edit
            </button>
          )
        }
      />
      {editing ? (
        <FormCard
          title="Edit crop details"
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={() => {
            updateRecord('crops', crop.id, { variety: variety.trim(), areaHa: num(area) })
            setEditing(false)
          }}
        >
          <Field label="Variety">
            <input className="input" value={variety} onChange={(e) => setVariety(e.target.value)} />
          </Field>
          <Field label="Growing area, hectares">
            <input className="input" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
          </Field>
        </FormCard>
      ) : (
        <div className="card details">
          <div>
            <span className="stat-label">Crop</span>
            <span>{crop.crop}</span>
          </div>
          <div>
            <span className="stat-label">Variety</span>
            <span>{crop.variety || '—'}</span>
          </div>
          <div>
            <span className="stat-label">Area</span>
            <span>{crop.areaHa ? `${formatNumber(crop.areaHa)} ha` : '—'}</span>
          </div>
          <div>
            <span className="stat-label">Seedlings</span>
            <span>{formatNumber(t.seedlings, 0)}</span>
          </div>
        </div>
      )}

      <div className="danger-zone">
        <DeleteButton
          label="Remove this crop"
          onDelete={() => {
            removeRecord('crops', crop.id)
            navigate('season', season.id)
          }}
        />
        <span className="field-hint">Deletes all planting, nutrition, harvest and export records for it.</span>
      </div>
    </>
  )
}
