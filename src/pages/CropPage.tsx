import { useState } from 'react'
import { removeRecord, seasonLabel, updateRecord, useDB, type Season, type SeasonCrop } from '../lib/store'
import { href, navigate } from '../lib/router'
import { cropName } from '../lib/crops'
import { formatNumber } from '../lib/format'
import { useCurrency } from '../lib/money'
import { useT } from '../lib/i18n'
import { Breadcrumbs, DeleteButton, Field, FormCard, PageHead, RateMissing, SectionHead, Stat, num, str } from '../components/ui'
import { cropTotals } from './cropTotals'
import { PlantingSection } from './sections/PlantingSection'
import { NutritionSection } from './sections/NutritionSection'
import { HarvestSection } from './sections/HarvestSection'
import { WorkersSection } from './sections/WorkersSection'
import { ExportSection } from './sections/ExportSection'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'planting', label: 'Planting' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'workers', label: 'Workers' },
  { id: 'harvest', label: 'Harvest' },
  { id: 'export', label: 'Export' },
] as const

export function CropPage({ season, crop, tab }: { season: Season; crop: SeasonCrop; tab: string }) {
  const t = useT()
  const lang = useDB().settings.lang
  const active = TABS.some((x) => x.id === tab) ? tab : 'overview'
  const name = cropName(crop.crop, lang)
  const title = crop.variety ? `${name} · ${crop.variety}` : name

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t('Seasons'), to: [] },
          { label: seasonLabel(season), to: ['season', season.id] },
          { label: name },
        ]}
      />
      <PageHead
        title={title}
        sub={`${t('{season} season', { season: seasonLabel(season) })}${crop.areaHa ? ` · ${formatNumber(crop.areaHa)} ${t('ha')}` : ''}`}
      />

      <nav className="tabs" aria-label={t('Crop sections')}>
        {TABS.map((x) => (
          <a
            key={x.id}
            className={`tab${active === x.id ? ' is-active' : ''}`}
            aria-current={active === x.id ? 'page' : undefined}
            href={href('season', season.id, 'crop', crop.id, x.id)}
          >
            {t(x.label)}
          </a>
        ))}
      </nav>

      {active === 'overview' && <Overview season={season} crop={crop} />}
      {active === 'planting' && <PlantingSection crop={crop} />}
      {active === 'nutrition' && <NutritionSection crop={crop} />}
      {active === 'workers' && <WorkersSection crop={crop} />}
      {active === 'harvest' && <HarvestSection season={season} crop={crop} />}
      {active === 'export' && <ExportSection crop={crop} />}
    </>
  )
}

function Overview({ season, crop }: { season: Season; crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const { fmt: money } = useCurrency()
  const tt = cropTotals(db, crop.id)
  const [editing, setEditing] = useState(false)
  const [variety, setVariety] = useState(crop.variety)
  const [area, setArea] = useState(str(crop.areaHa))

  const go = (tab: string) => navigate('season', season.id, 'crop', crop.id, tab)

  return (
    <>
      <SectionHead title={t('Harvest & export')} />
      <div className="stat-grid">
        <Stat label={t('Boxes harvested')} value={formatNumber(tt.boxesHarvested, 0)} />
        <Stat label={t('Boxes exported')} value={formatNumber(tt.boxesExported, 0)} />
        <Stat
          label={t('Boxes in stock')}
          value={formatNumber(tt.boxesInStock, 0)}
          tone={tt.boxesInStock < 0 ? 'warn' : tt.boxesInStock > 0 ? 'good' : undefined}
        />
        <Stat label={t('Trucks sent')} value={formatNumber(tt.trucks, 0)} />
      </div>

      <SectionHead title={t('Costs')} />
      <div className="stat-grid">
        <Stat label={t('Seedlings')} value={money(tt.plantingCost)} />
        <Stat label={t('Nutrition')} value={money(tt.nutritionCost)} />
        <Stat label={t('Workers')} value={money(tt.workerPay)} />
        <Stat label={t('Delivery')} value={money(tt.deliveryCost)} />
        <Stat label={t('Total')} value={money(tt.totalCost)} />
      </div>
      <RateMissing show={tt.rateMissing} />

      <SectionHead title={t('Record something')} />
      <div className="quick-grid">
        <button className="quick" onClick={() => go('planting')}>
          <b>{t('Planting')}</b>
          <span>{t('Seedlings arrived or planted')}</span>
        </button>
        <button className="quick" onClick={() => go('nutrition')}>
          <b>{t('Nutrition')}</b>
          <span>{t('Fertilizer given')}</span>
        </button>
        <button className="quick" onClick={() => go('workers')}>
          <b>{t('Workers')}</b>
          <span>{t('Days worked and boxes prepared')}</span>
        </button>
        <button className="quick" onClick={() => go('harvest')}>
          <b>{t('Harvest')}</b>
          <span>{t('Boxes packed by day')}</span>
        </button>
        <button className="quick" onClick={() => go('export')}>
          <b>{t('Export')}</b>
          <span>{t('Truck loaded')}</span>
        </button>
      </div>

      <SectionHead
        title={t('Crop details')}
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
              {t('Edit')}
            </button>
          )
        }
      />
      {editing ? (
        <FormCard
          title={t('Edit crop details')}
          submitLabel={t('Save')}
          onCancel={() => setEditing(false)}
          onSubmit={() => {
            updateRecord('crops', crop.id, { variety: variety.trim(), areaHa: num(area) })
            setEditing(false)
          }}
        >
          <Field label={t('Variety')}>
            <input id="edit-variety" className="input" value={variety} onChange={(e) => setVariety(e.target.value)} />
          </Field>
          <Field label={t('Growing area, hectares')}>
            <input id="edit-area" className="input" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
          </Field>
        </FormCard>
      ) : (
        <div className="card details">
          <div>
            <span className="stat-label">{t('Crop')}</span>
            <span>{cropName(crop.crop, db.settings.lang)}</span>
          </div>
          <div>
            <span className="stat-label">{t('Variety')}</span>
            <span>{crop.variety || '—'}</span>
          </div>
          <div>
            <span className="stat-label">{t('Area')}</span>
            <span>{crop.areaHa ? `${formatNumber(crop.areaHa)} ${t('ha')}` : '—'}</span>
          </div>
          <div>
            <span className="stat-label">{t('Seedlings')}</span>
            <span>{formatNumber(tt.seedlings, 0)}</span>
          </div>
        </div>
      )}

      <div className="danger-zone">
        <DeleteButton
          label={t('Remove this crop')}
          onDelete={() => {
            removeRecord('crops', crop.id)
            navigate('season', season.id)
          }}
        />
        <span className="field-hint">{t('Deletes all records for this crop, including worker days. Workers stay.')}</span>
      </div>
    </>
  )
}
