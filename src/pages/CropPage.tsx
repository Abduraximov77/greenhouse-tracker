import { useEffect, useRef, useState } from 'react'
import { cropDays, seasonLabel, updateRecord, useDB, type Season, type SeasonCrop } from '../lib/store'
import { href, navigate } from '../lib/router'
import { cropName } from '../lib/crops'
import { formatNumber } from '../lib/format'
import { useCurrency } from '../lib/money'
import { useT } from '../lib/i18n'
import { Breadcrumbs, Field, FormCard, PageHead, RateMissing, SectionHead, Stat, num, str } from '../components/ui'
import { cropTotals } from './cropTotals'
import { PlantingSection } from './sections/PlantingSection'
import { NutritionSection } from './sections/NutritionSection'
import { HarvestSection } from './sections/HarvestSection'
import { WorkersSection } from './sections/WorkersSection'
import { ExportSection } from './sections/ExportSection'
import { ExpensesSection } from './sections/ExpensesSection'

type SectionId = 'overview' | 'planting' | 'nutrition' | 'workers' | 'expenses' | 'harvest' | 'export'

const SECTIONS: { id: SectionId; label: string; sub: string }[] = [
  { id: 'overview', label: 'Overview', sub: 'Summary of this crop' },
  { id: 'planting', label: 'Planting', sub: 'Seedlings: arrived & planted' },
  { id: 'nutrition', label: 'Nutrition', sub: 'Fertilizer and nutrients given' },
  { id: 'workers', label: 'Workers', sub: 'Days worked, boxes prepared and pay' },
  { id: 'expenses', label: 'Expenses', sub: 'What was bought or paid for, by day' },
  { id: 'harvest', label: 'Harvest', sub: 'Packed boxes ready for export' },
  { id: 'export', label: 'Export', sub: 'Trucks leaving with boxes' },
]

/** Line icons for the crop sections. */
function SectionIcon({ id }: { id: SectionId }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {id === 'overview' && (
        <>
          <rect x="3" y="3" width="7.5" height="7.5" rx="2" {...p} />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" {...p} />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" {...p} />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" {...p} />
        </>
      )}
      {id === 'planting' && (
        <>
          <path d="M12 21v-9M12 12c0-4 3-7 8-7 0 5-3 7-8 7zM12 14c0-3-2.5-5.5-7-5.5 0 4 2.5 5.5 7 5.5z" {...p} />
          <path d="M6 21h12" {...p} />
        </>
      )}
      {id === 'nutrition' && (
        <>
          <path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" {...p} />
          <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" {...p} />
        </>
      )}
      {id === 'workers' && (
        <>
          <circle cx="9" cy="8" r="3.2" {...p} />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" {...p} />
          <circle cx="17" cy="9" r="2.5" {...p} />
          <path d="M17 14c2.5 0 4 2 4 4.5" {...p} />
        </>
      )}
      {id === 'expenses' && (
        <>
          <rect x="3" y="6" width="18" height="13" rx="2.5" {...p} />
          <path d="M3 10h18M7 15h4" {...p} />
        </>
      )}
      {id === 'harvest' && <path d="M3 9l9-5 9 5v9l-9 4-9-4zM3 9l9 4 9-4M12 13v9" {...p} />}
      {id === 'export' && (
        <>
          <path d="M2 6h11v10H2zM13 9h4.5l3.5 3.5V16h-8z" {...p} />
          <circle cx="6" cy="17.5" r="2" {...p} fill="var(--surface)" />
          <circle cx="17" cy="17.5" r="2" {...p} fill="var(--surface)" />
        </>
      )}
    </svg>
  )
}

export function CropPage({ season, crop, tab }: { season: Season; crop: SeasonCrop; tab: string }) {
  const db = useDB()
  const t = useT()
  const lang = db.settings.lang
  const active: SectionId = SECTIONS.some((x) => x.id === tab) ? (tab as SectionId) : 'overview'
  const section = SECTIONS.find((x) => x.id === active)!
  const name = cropName(crop.crop, lang)

  // On phones the menu is a sideways row: keep the current section in view.
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = navRef.current
    const item = nav?.querySelector<HTMLElement>('.is-active')
    if (nav && item && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = item.offsetLeft - nav.clientWidth / 2 + item.clientWidth / 2
    }
  }, [active])

  // Number of entries shown next to each section in the menu.
  const days = cropDays(db, crop.id)
  const counts: Partial<Record<SectionId, number>> = {
    planting: db.plantings.filter((r) => r.cropId === crop.id).length,
    nutrition: db.nutrition.filter((r) => r.cropId === crop.id).length,
    workers: new Set(days.map((d) => d.workerId)).size,
    harvest: new Set([
      ...db.harvests.filter((r) => r.cropId === crop.id).map((r) => r.date),
      ...days.filter((d) => (d.boxes ?? 0) > 0).map((d) => d.date),
    ]).size,
    export: db.shipments.filter((r) => r.cropId === crop.id).length,
    expenses: db.expenses.filter((r) => r.cropId === crop.id).length,
  }

  return (
    <div className="crop-layout">
      <aside className="crop-side">
        <a className="crop-id" href={href('season', season.id)}>
          <span className="crop-id-season">{seasonLabel(season)}</span>
          <span className="crop-id-name">{name}</span>
          <span className="crop-id-meta">
            {[crop.variety, crop.areaHa ? `${formatNumber(crop.areaHa)} ${t('ha')}` : ''].filter(Boolean).join(' · ') ||
              t('No variety set')}
          </span>
        </a>
        <nav ref={navRef} className="crop-nav" aria-label={t('Crop sections')}>
          {SECTIONS.map((x) => (
            <a
              key={x.id}
              className={`crop-nav-item${active === x.id ? ' is-active' : ''}`}
              aria-current={active === x.id ? 'page' : undefined}
              href={href('season', season.id, 'crop', crop.id, x.id)}
            >
              <SectionIcon id={x.id} />
              <span className="crop-nav-label">{t(x.label)}</span>
              {!!counts[x.id] && <span className="crop-nav-count">{counts[x.id]}</span>}
            </a>
          ))}
        </nav>
      </aside>

      <div className="crop-main">
        <Breadcrumbs
          items={[
            { label: t('Seasons'), to: [] },
            { label: seasonLabel(season), to: ['season', season.id] },
            { label: name, to: ['season', season.id, 'crop', crop.id] },
            ...(active === 'overview' ? [] : [{ label: t(section.label) }]),
          ]}
        />
        <PageHead title={t(section.label)} sub={t(section.sub)} />

        {active === 'overview' && <Overview season={season} crop={crop} />}
        {active === 'planting' && <PlantingSection crop={crop} />}
        {active === 'nutrition' && <NutritionSection crop={crop} />}
        {active === 'workers' && <WorkersSection crop={crop} />}
        {active === 'expenses' && <ExpensesSection crop={crop} />}
        {active === 'harvest' && <HarvestSection season={season} crop={crop} />}
        {active === 'export' && <ExportSection crop={crop} />}
      </div>
    </div>
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
        <Stat label={t('Expenses')} value={money(tt.expensesCost)} />
        <Stat label={t('Delivery')} value={money(tt.deliveryCost)} />
        <Stat label={t('Total')} value={money(tt.totalCost)} />
      </div>
      <RateMissing show={tt.rateMissing} />

      <SectionHead title={t('Payments')} />
      <div className="stat-grid">
        <Stat label={t('Paid')} value={money(tt.paid)} tone={tt.paid > 0 ? 'good' : undefined} />
        <Stat label={t('Still to pay')} value={money(tt.owed)} tone={tt.owed > 0 ? 'warn' : undefined} />
      </div>
      <p className="field-hint">{t('Worker pay and expenses. Mark them paid in the Workers and Expenses sections.')}</p>

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
        <button className="quick" onClick={() => go('expenses')}>
          <b>{t('Expenses')}</b>
          <span>{t('Something bought or paid for')}</span>
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
    </>
  )
}
