import { useState } from 'react'
import {
  addRecord,
  byDateDesc,
  groupByDate,
  removeRecord,
  updateRecord,
  useDB,
  type Planting,
  type SeasonCrop,
} from '../../lib/store'
import { formatDate, formatNumber, round, todayISO } from '../../lib/format'
import { useCurrency } from '../../lib/money'
import { useT } from '../../lib/i18n'
import {
  Computed,
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

type Form = {
  arrivedOn: string
  plantedOn: string
  supplier: string
  quantity: string
  unitPrice: string
  totalCost: string
  currency: string
  note: string
}

export function PlantingSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
  const list = db.plantings.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.arrivedOn))
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  // Which price field the user typed last: the other one is calculated.
  const [priceMode, setPriceMode] = useState<'unit' | 'total'>('unit')
  const [error, setError] = useState<string | null>(null)

  function recalc(next: Form, mode: 'unit' | 'total'): Form {
    const q = num(next.quantity)
    if (mode === 'unit') {
      const u = num(next.unitPrice)
      return { ...next, totalCost: q !== null && u !== null ? str(round(q * u)) : next.totalCost }
    }
    const tc = num(next.totalCost)
    return { ...next, unitPrice: q && tc !== null ? str(round(tc / q, 4)) : next.unitPrice }
  }

  function open(rec?: Planting) {
    setError(null)
    setPriceMode('unit')
    if (!rec) {
      // Suggest last supplier, price and currency to save typing.
      const last = [...db.plantings].sort(byDateDesc((r) => r.arrivedOn))[0]
      setF({
        arrivedOn: todayISO(),
        plantedOn: '',
        supplier: list[0]?.supplier ?? '',
        quantity: '',
        unitPrice: list[0] ? str(list[0].unitPrice) : '',
        totalCost: '',
        currency: list[0]?.currency ?? last?.currency ?? cur.display,
        note: '',
      })
      setEditing('new')
    } else {
      setF({
        arrivedOn: rec.arrivedOn,
        plantedOn: rec.plantedOn,
        supplier: rec.supplier,
        quantity: str(rec.quantity),
        unitPrice: str(rec.unitPrice),
        totalCost: str(rec.totalCost),
        currency: rec.currency,
        note: rec.note,
      })
      setEditing(rec.id)
    }
  }

  function submit() {
    if (!f) return
    const quantity = num(f.quantity)
    const unitPrice = num(f.unitPrice)
    const totalCost = num(f.totalCost)
    if (!f.arrivedOn) return setError(t('Enter the date the seedlings arrived.'))
    if (!quantity || quantity <= 0) return setError(t('Enter how many seedlings (quantity).'))
    if (unitPrice === null && totalCost === null) return setError(t('Enter the price per seedling or the total cost.'))
    const data = {
      cropId: crop.id,
      arrivedOn: f.arrivedOn,
      plantedOn: f.plantedOn,
      supplier: f.supplier.trim(),
      quantity,
      unitPrice: unitPrice ?? round((totalCost ?? 0) / quantity, 4),
      totalCost: totalCost ?? round(quantity * (unitPrice ?? 0)),
      currency: f.currency,
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('plantings', data)
    else if (editing) updateRecord('plantings', editing, data)
    setEditing(null)
  }

  const totalQty = list.reduce((a, r) => a + r.quantity, 0)
  const total = cur.sum(list.map((r) => ({ amount: r.totalCost, currency: r.currency })))
  const qty = f ? num(f.quantity) : null
  const setCurrency = (currency: string) => f && setF({ ...f, currency })

  return (
    <>
      <div className="stat-grid">
        <Stat label={t('Seedlings')} value={formatNumber(totalQty, 0)} />
        <Stat label={t('Total cost')} value={cur.fmt(total.total)} />
        <Stat label={t('Average per seedling')} value={totalQty ? cur.fmt(total.total / totalQty) : '—'} />
      </div>
      <RateMissing show={total.missing} />

      <SectionHead
        title={t('Seedlings: arrived & planted')}
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + {t('Add seedlings')}
            </button>
          )
        }
      />

      {editing && f && (
        <FormCard
          title={editing === 'new' ? t('Add seedlings') : t('Edit seedlings')}
          submitLabel={editing === 'new' ? t('Save') : t('Save changes')}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label={t('Arrived on')}>
            <input id="pl-arrived" className="input" type="date" value={f.arrivedOn} onChange={(e) => setF({ ...f, arrivedOn: e.target.value })} />
          </Field>
          <Field label={t('Planted on')} hint={t('Leave empty if not planted yet')}>
            <input id="pl-planted" className="input" type="date" value={f.plantedOn} onChange={(e) => setF({ ...f, plantedOn: e.target.value })} />
          </Field>
          <Field label={t('Supplier (optional)')}>
            <input id="pl-supplier" className="input" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
          </Field>
          <Field label={t('Quantity (seedlings)')}>
            <input
              id="pl-qty"
              className="input"
              inputMode="decimal"
              value={f.quantity}
              onChange={(e) => setF(recalc({ ...f, quantity: e.target.value }, priceMode))}
            />
          </Field>
          <Field label={t('Price per seedling')}>
            <MoneyInput
              id="pl-unit"
              className={priceMode === 'total' ? 'is-computed' : undefined}
              value={f.unitPrice}
              currency={f.currency}
              onCurrency={setCurrency}
              onChange={(v) => {
                setPriceMode('unit')
                setF(recalc({ ...f, unitPrice: v }, 'unit'))
              }}
            />
          </Field>
          <Field label={t('Total cost')} hint={t('Filled in automatically, or type it and the price per seedling is worked out')}>
            <MoneyInput
              id="pl-total"
              className={priceMode === 'unit' ? 'is-computed' : undefined}
              value={f.totalCost}
              currency={f.currency}
              onCurrency={setCurrency}
              onChange={(v) => {
                setPriceMode('total')
                setF(recalc({ ...f, totalCost: v }, 'total'))
              }}
            />
          </Field>
          <Computed
            label={t('Total cost')}
            value={cur.both(num(f.totalCost), f.currency)}
            note={
              qty && num(f.unitPrice) !== null
                ? `${formatNumber(qty, 0)} × ${cur.fmt(num(f.unitPrice), f.currency)}`
                : undefined
            }
          />
          <Field label={t('Note (optional)')} wide>
            <input id="pl-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {list.length === 0 ? (
        !editing && <Empty title={t('No seedlings recorded yet')}>{t('Add when seedlings arrive, with their quantity and price.')}</Empty>
      ) : (
        <div className="day-groups">
          {groupByDate(list, (r) => r.arrivedOn).map(([date, rows]) => (
            <section key={date} className="day-group">
              <DayHeading date={date} />
              <ul className="records">
                {rows.map((r) => (
                  <li key={r.id} className="card record">
                    <div className="record-main">
                      <span className="record-title">
                        {t('{n} seedlings', { n: formatNumber(r.quantity, 0) })} · {cur.both(r.totalCost, r.currency)}
                      </span>
                      <span className="record-sub">
                        {r.plantedOn ? t('Planted {date}', { date: formatDate(r.plantedOn) }) : t('Not planted yet')}
                      </span>
                      <span className="record-sub">
                        {t('{amount} each', { amount: cur.fmt(r.unitPrice, r.currency) })}
                        {r.supplier ? ` · ${r.supplier}` : ''}
                        {r.note ? ` · ${r.note}` : ''}
                      </span>
                      <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
                    </div>
                    <div className="record-actions">
                      <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                        {t('Edit')}
                      </button>
                      <DeleteButton onDelete={() => removeRecord('plantings', r.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
