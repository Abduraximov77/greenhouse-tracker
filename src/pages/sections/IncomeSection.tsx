import { useState } from 'react'
import {
  addRecord,
  byDateDesc,
  groupByDate,
  removeRecord,
  updateRecord,
  useDB,
  type Income,
  type Sale,
  type SeasonCrop,
} from '../../lib/store'
import { formatNumber, todayISO } from '../../lib/format'
import { useCurrency } from '../../lib/money'
import { href } from '../../lib/router'
import { useT } from '../../lib/i18n'
import { cropName } from '../../lib/crops'
import {
  DayHeading,
  DeleteButton,
  Empty,
  Field,
  FormCard,
  MoneyInput,
  RateMissing,
  SectionHead,
  Stamp,
  Stat,
  num,
  str,
} from '../../components/ui'

type Form = { date: string; source: string; from: string; amount: string; currency: string; note: string }

/** A line on the Income page: money entered here, or a sale from a truck (entered under Export). */
type Row = { kind: 'income'; date: string; rec: Income } | { kind: 'sale'; date: string; rec: Sale }

/** Kirim: money that came in, with what it was for and who paid. */
export function IncomeSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
  const list = db.incomes.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const all = [...db.incomes].sort(byDateDesc((r) => r.date))
  const sources = [...new Set(all.map((r) => r.source).filter(Boolean))]
  const payers = [...new Set(all.map((r) => r.from).filter(Boolean))]
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)

  function open(rec?: Income) {
    setError(null)
    setF(
      rec
        ? { date: rec.date, source: rec.source, from: rec.from, amount: str(rec.amount), currency: rec.currency, note: rec.note }
        : { date: todayISO(), source: '', from: '', amount: '', currency: all[0]?.currency ?? cur.display, note: '' },
    )
    setEditing(rec ? rec.id : 'new')
  }

  function submit() {
    if (!f) return
    const amount = num(f.amount)
    if (!f.date) return setError(t('Enter the date.'))
    if (!f.source.trim()) return setError(t('Enter what the money is from.'))
    if (amount === null || amount <= 0) return setError(t('Enter how much came in.'))
    const data = {
      cropId: crop.id,
      date: f.date,
      source: f.source.trim(),
      from: f.from.trim(),
      amount,
      currency: f.currency,
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('incomes', data)
    else if (editing) updateRecord('incomes', editing, data)
    setEditing(null)
  }

  // Truck sales are income too: they are shown here and counted in every total.
  const sales = db.sales.filter((r) => r.cropId === crop.id)
  const rows: Row[] = [
    ...list.map((rec) => ({ kind: 'income' as const, date: rec.date, rec })),
    ...sales.map((rec) => ({ kind: 'sale' as const, date: rec.date, rec })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.rec.createdAt.localeCompare(a.rec.createdAt))
  const money = (rs: Row[]) => cur.sum(rs.map((r) => ({ amount: r.rec.amount, currency: r.rec.currency })))
  const total = money(rows)
  const today = money(rows.filter((r) => r.date === todayISO()))
  const month = money(rows.filter((r) => r.date.startsWith(todayISO().slice(0, 7))))
  const truckOf = (id: string) => db.shipments.find((x) => x.id === id)
  const exportHref = href('season', crop.seasonId, 'crop', crop.id, 'export')

  return (
    <>
      <div className="stat-grid">
        <Stat label={t('Came in today')} value={cur.fmt(today.total)} />
        <Stat label={t('This month')} value={cur.fmt(month.total)} />
        <Stat label={t('This season')} value={cur.fmt(total.total)} tone={total.total > 0 ? 'good' : undefined} />
        <Stat label={t('Entries')} value={rows.length} />
      </div>
      <RateMissing show={total.missing} />
      {sales.length > 0 && (
        <p className="field-hint">
          {t('{crop} sales are entered under Export and appear here automatically.', { crop: cropName(crop.crop, db.settings.lang) })}{' '}
          <a href={exportHref}>{t('Open Export')}</a>
        </p>
      )}

      <SectionHead
        title=""
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + {t('Add income')}
            </button>
          )
        }
      />

      {editing && f && (
        <FormCard
          title={editing === 'new' ? t('Add income') : t('Edit income')}
          submitLabel={editing === 'new' ? t('Save') : t('Save changes')}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label={t('Date')}>
            <input id="in-date" className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label={t('What the money is from')}>
            <input
              id="in-source"
              className="input"
              list="income-sources"
              value={f.source}
              onChange={(e) => setF({ ...f, source: e.target.value })}
              placeholder={t('e.g. tomato sale, export payment')}
            />
            <datalist id="income-sources">
              {sources.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label={t('Amount received')}>
            <MoneyInput
              id="in-amount"
              value={f.amount}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, amount: v })}
            />
          </Field>
          <Field label={t('From whom (optional)')}>
            <input
              id="in-from"
              className="input"
              list="income-payers"
              value={f.from}
              onChange={(e) => setF({ ...f, from: e.target.value })}
            />
            <datalist id="income-payers">
              {payers.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label={t('Note (optional)')} wide>
            <input id="in-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {rows.length === 0 ? (
        !editing && <Empty title={t('No income recorded yet')}>{t('Add money that came in: sales, payments, anything received.')}</Empty>
      ) : (
        <div className="day-groups">
          {groupByDate(rows, (r) => r.date).map(([date, dayRows]) => (
            <section key={date} className="day-group">
              <DayHeading date={date} right={<span className="text-income">+ {cur.fmt(money(dayRows).total)}</span>} />
              <ul className="records">
                {dayRows.map(({ kind, rec }) => {
                  if (kind === 'sale') {
                    const truck = truckOf(rec.shipmentId)
                    return (
                      <li key={rec.id} className="card record record-income record-sale">
                        <div className="record-main">
                          <span className="record-title">
                            <span className="kind-badge">{t('{crop} sales', { crop: cropName(crop.crop, db.settings.lang) })}</span>{' '}
                            {truck && <span className="plate">{truck.truckNumber}</span>}{' '}
                            {t('{n} boxes', { n: formatNumber(rec.boxes, 0) })}
                            {rec.kg ? ` · ${formatNumber(rec.kg, 0)} ${t('kg')}` : ''} ·{' '}
                            <span className="text-income">+ {cur.both(rec.amount, rec.currency)}</span>{' '}
                          </span>
                          {rec.buyer && (
                            <span className="record-sub">
                              {t('Buyer')}: {rec.buyer}
                            </span>
                          )}
                          {rec.note && <span className="record-sub">{rec.note}</span>}
                        </div>
                        <div className="record-actions">
                          <a className="btn btn-ghost btn-small" href={exportHref}>
                            {t('Edit in Export')}
                          </a>
                        </div>
                      </li>
                    )
                  }
                  const r = rec
                  return (
                    <li key={r.id} className="card record record-income">
                      <div className="record-main">
                        <span className="record-title">
                          {r.source} · <span className="text-income">+ {cur.both(r.amount, r.currency)}</span>
                        </span>
                        {r.from && <span className="record-sub">{t('From: {name}', { name: r.from })}</span>}
                        {r.note && <span className="record-sub">{r.note}</span>}
                        <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
                      </div>
                      <div className="record-actions">
                        <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                          {t('Edit')}
                        </button>
                        <DeleteButton onDelete={() => removeRecord('incomes', r.id)} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
