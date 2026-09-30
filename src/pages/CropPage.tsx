import { useEffect, useRef } from 'react'
import { cropDays, seasonLabel, useDB, type Season, type SeasonCrop } from '../lib/store'
import { href } from '../lib/router'
import { cropName } from '../lib/crops'
import { formatNumber } from '../lib/format'
import { useCurrency } from '../lib/money'
import { useT } from '../lib/i18n'
import { CropPlace, PlantedDate, WeatherWarningsBanner } from '../components/Weather'
import { Breadcrumbs, PageHead, RateMissing, SectionHead, Stat } from '../components/ui'
import { cropTotals } from './cropTotals'
import { HarvestSection } from './sections/HarvestSection'
import { WorkersSection } from './sections/WorkersSection'
import { ExportSection } from './sections/ExportSection'
import { ExpensesSection } from './sections/ExpensesSection'
import { IncomeSection } from './sections/IncomeSection'
import { DealsSection } from './sections/DealsSection'
import { AssistantSection } from './sections/AssistantSection'

type SectionId = 'overview' | 'workers' | 'expenses' | 'income' | 'deals' | 'harvest' | 'export' | 'assistant'

const SECTIONS: { id: SectionId; label: string; sub: string }[] = [
  { id: 'overview', label: 'Overview', sub: 'Summary of this crop' },
  { id: 'workers', label: 'Workers', sub: 'Days worked, boxes prepared and pay' },
  { id: 'expenses', label: 'Expenses', sub: 'What was bought or paid for, by day' },
  { id: 'income', label: 'Income', sub: 'Money that came in, by day' },
  { id: 'deals', label: 'Give & take', sub: 'Money or products given to and taken from other people' },
  { id: 'harvest', label: 'Harvest', sub: 'Packed boxes ready for export' },
  { id: 'export', label: 'Export', sub: 'Trucks leaving with boxes' },
  { id: 'assistant', label: 'Assistant', sub: 'Ask about this crop, with photos' },
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
      {id === 'income' && (
        <>
          <path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" {...p} />
          <path d="M4 14v4.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V14" {...p} />
        </>
      )}
      {id === 'deals' && <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" {...p} />}
      {id === 'harvest' && <path d="M3 9l9-5 9 5v9l-9 4-9-4zM3 9l9 4 9-4M12 13v9" {...p} />}
      {id === 'assistant' && (
        <>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" {...p} />
          <path d="M9 9.5h.01M12 9.5h.01M15 9.5h.01" {...p} strokeWidth={2.6} />
        </>
      )}
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
    workers: new Set(days.map((d) => d.workerId)).size,
    harvest: new Set([
      ...db.harvests.filter((r) => r.cropId === crop.id).map((r) => r.date),
      ...days.filter((d) => (d.boxes ?? 0) > 0).map((d) => d.date),
    ]).size,
    export: db.shipments.filter((r) => r.cropId === crop.id).length,
    expenses: db.expenses.filter((r) => r.cropId === crop.id).length,
    income: db.incomes.filter((r) => r.cropId === crop.id).length,
    deals: db.deals.filter((r) => r.cropId === crop.id).length,
    assistant: db.answers.filter((r) => r.cropId === crop.id).length,
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
        <CropPlace crop={crop} />
        <PlantedDate key={crop.plantedAt ?? ''} crop={crop} />
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

        {active === 'overview' && <Overview crop={crop} />}
        {active === 'workers' && <WorkersSection crop={crop} />}
        {active === 'expenses' && <ExpensesSection crop={crop} />}
        {active === 'income' && <IncomeSection crop={crop} />}
        {active === 'deals' && <DealsSection crop={crop} />}
        {active === 'harvest' && <HarvestSection season={season} crop={crop} />}
        {active === 'export' && <ExportSection crop={crop} />}
        {active === 'assistant' && <AssistantSection crop={crop} />}
      </div>
    </div>
  )
}

function Overview({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const { fmt: money } = useCurrency()
  const tt = cropTotals(db, crop.id)
  const crop_ = cropName(crop.crop, db.settings.lang)
  return (
    <>
      <WeatherWarningsBanner crop={crop} />
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
        {tt.salesTotal > 0 && <Stat label={t('{crop} sales', { crop: crop_ })} value={money(tt.salesTotal)} />}
      </div>

      <SectionHead title={t('Income and profit')} />
      <div className="stat-grid">
        <Stat label={t('Income')} value={money(tt.income)} tone={tt.income > 0 ? 'good' : undefined} />
        <Stat label={t('All costs')} value={money(tt.totalCost)} />
        <Stat
          label={tt.profit < 0 ? t('Loss') : t('Profit')}
          value={money(Math.abs(tt.profit))}
          tone={tt.profit > 0 ? 'good' : tt.profit < 0 ? 'warn' : undefined}
        />
      </div>
      <RateMissing show={tt.incomeMissing} />
      <p className="field-hint">{t('Profit = income − all costs (workers, expenses, delivery).')}</p>

      <SectionHead title={t('Costs')} />
      <div className="stat-grid">
        <Stat label={t('Workers')} value={money(tt.workerPay)} note={<Owed n={tt.owedWorkers} of={tt.workerPay} />} />
        <Stat label={t('Expenses')} value={money(tt.expensesCost)} note={<Owed n={tt.owedExpenses} of={tt.expensesCost} />} />
        <Stat label={t('Delivery')} value={money(tt.deliveryCost)} note={<Owed n={tt.owedDelivery} of={tt.deliveryCost} />} />
        <Stat label={t('Total')} value={money(tt.totalCost)} note={<Owed n={tt.owed} of={tt.totalCost} />} />
      </div>
      <RateMissing show={tt.rateMissing} />

      <SectionHead title={t('Payments')} />
      <div className="stat-grid">
        <Stat label={t('Paid')} value={money(tt.paid)} tone={tt.paid > 0 ? 'good' : undefined} />
        <Stat label={t('Still to pay')} value={money(tt.owed)} tone={tt.owed > 0 ? 'warn' : undefined} />
      </div>
      <p className="field-hint">{t('All costs: expenses, workers and delivery. Paid + still to pay = total.')}</p>

      <SectionHead title={t('Give & take')} />
      <div className="stat-grid">
        <Stat label={t('We gave (money)')} value={money(tt.dealsGiven)} />
        <Stat label={t('We got (money)')} value={money(tt.dealsGot)} />
        <Stat label={t('They owe us')} value={money(tt.owedToUs)} tone={tt.owedToUs > 0 ? 'good' : undefined} />
        <Stat label={t('We owe')} value={money(tt.weOwe)} tone={tt.weOwe > 0 ? 'warn' : undefined} />
      </div>
      <RateMissing show={tt.dealsMissing} />
      <DealsOverview people={tt.dealPeopleList} open={tt.dealsOpen} done={tt.dealsDone} />
    </>
  )
}

/** Who still has to give back what (money and products), both ways. */
function DealsOverview({ people, open, done }: { people: ReturnType<typeof cropTotals>['dealPeopleList']; open: number; done: number }) {
  const t = useT()
  const { fmt } = useCurrency()
  if (people.length === 0) return null
  const lines = (sign: 1 | -1) =>
    people.flatMap((p) => [
      ...(p.hasMoney && p.balance * sign > 0.005 ? [{ person: p.person, what: fmt(Math.abs(p.balance)) }] : []),
      ...p.products
        .filter((x) => x.net * sign > 0)
        .map((x) => ({ person: p.person, what: `${x.item} · ${formatNumber(Math.abs(x.net))} ${x.unit}`.trim() })),
    ])
  const toUs = lines(1)
  const fromUs = lines(-1)
  const List = ({ rows, cls }: { rows: { person: string; what: string }[]; cls: string }) =>
    rows.length === 0 ? (
      <p className="deal-none">✓ {t('Nothing')}</p>
    ) : (
      <ul className="deal-lines">
        {rows.map((r, i) => (
          <li key={i}>
            <b>{r.person}</b>
            <span className={cls}>{r.what}</span>
          </li>
        ))}
      </ul>
    )
  return (
    <>
      <div className="deal-overview">
        <div className="card deal-col deal-col-in">
          <h3>{t('They have to give back to us')}</h3>
          <List rows={toUs} cls="text-income" />
        </div>
        <div className="card deal-col deal-col-out">
          <h3>{t('We have to give back')}</h3>
          <List rows={fromUs} cls="text-owed" />
        </div>
      </div>
      <p className="field-hint">
        {t('Open: {open} · Done: {done} · People: {n}.', { open, done, n: people.length })}{' '}
        {t('Kept separately: give & take is not counted in costs or profit.')}
      </p>
    </>
  )
}

/** Small line under a cost: "Not paid: …" in orange, or "✓ Paid" when nothing is owed. */
function Owed({ n, of }: { n: number; of: number }) {
  const t = useT()
  const { fmt } = useCurrency()
  if (of <= 0.005) return null
  return n > 0.005 ? (
    <span className="text-owed">{t('Not paid: {amount}', { amount: fmt(n) })}</span>
  ) : (
    <span className="stat-paid">✓ {t('Paid')}</span>
  )
}
