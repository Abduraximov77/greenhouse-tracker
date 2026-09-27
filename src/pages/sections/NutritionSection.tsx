import { useState } from 'react'
import {
  addRecord,
  byDateDesc,
  groupByDate,
  removeRecord,
  updateRecord,
  useDB,
  type AmountUnit,
  type Nutrition,
  type SeasonCrop,
} from '../../lib/store'
import { formatNumber, round, todayISO } from '../../lib/format'
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
import { formatDate } from '../../lib/format'

type Form = {
  date: string
  product: string
  unit: AmountUnit
  ratePerHa: string
  areaHa: string
  pricePerUnit: string
  currency: string
  note: string
}

export function NutritionSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
  const list = db.nutrition.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const allSorted = [...db.nutrition].sort(byDateDesc((r) => r.date))
  const products = [...new Set(allSorted.map((r) => r.product).filter(Boolean))]
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unitLabel = (u: AmountUnit) => (u === 'kg' ? t('kg') : t('L'))

  function open(rec?: Nutrition) {
    setError(null)
    if (!rec) {
      setF({
        date: todayISO(),
        product: '',
        unit: 'kg',
        ratePerHa: '',
        areaHa: str(crop.areaHa),
        pricePerUnit: '',
        currency: allSorted[0]?.currency ?? cur.display,
        note: '',
      })
      setEditing('new')
    } else {
      setF({
        date: rec.date,
        product: rec.product,
        unit: rec.unit,
        ratePerHa: str(rec.ratePerHa),
        areaHa: str(rec.areaHa),
        pricePerUnit: str(rec.pricePerUnit),
        currency: rec.currency,
        note: rec.note,
      })
      setEditing(rec.id)
    }
  }

  /** When a known product is typed, reuse its last unit, rate, price and currency. */
  function setProduct(product: string) {
    if (!f) return
    const last = allSorted.find((r) => r.product === product)
    if (last && editing === 'new') {
      setF({
        ...f,
        product,
        unit: last.unit,
        ratePerHa: str(last.ratePerHa),
        pricePerUnit: str(last.pricePerUnit),
        currency: last.currency,
      })
    } else setF({ ...f, product })
  }

  const rate = f ? num(f.ratePerHa) : null
  const area = f ? num(f.areaHa) : null
  const price = f ? num(f.pricePerUnit) : null
  const totalAmount = rate !== null && area !== null ? round(rate * area, 3) : null
  const totalCost = totalAmount !== null && price !== null ? round(totalAmount * price) : null

  function submit() {
    if (!f) return
    if (!f.date) return setError(t('Enter the date.'))
    if (!f.product.trim()) return setError(t('Enter the fertilizer or product name.'))
    if (rate === null || rate <= 0) return setError(t('Enter the quantity per hectare.'))
    if (area === null || area <= 0) return setError(t('Enter the area in hectares.'))
    const data = {
      cropId: crop.id,
      date: f.date,
      product: f.product.trim(),
      unit: f.unit,
      ratePerHa: rate,
      areaHa: area,
      totalAmount: totalAmount ?? 0,
      pricePerUnit: price,
      totalCost,
      currency: f.currency,
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('nutrition', data)
    else if (editing) updateRecord('nutrition', editing, data)
    // Remember the area on the crop if it wasn't set yet.
    if (!crop.areaHa) updateRecord('crops', crop.id, { areaHa: area })
    setEditing(null)
  }

  const cost = cur.sum(list.map((r) => ({ amount: r.totalCost, currency: r.currency })))
  const lastDate = list[0]?.date

  return (
    <>
      <div className="stat-grid">
        <Stat label={t('Applications')} value={formatNumber(list.length, 0)} />
        <Stat label={t('Total cost')} value={cur.fmt(cost.total)} />
        <Stat label={t('Last given')} value={lastDate ? formatDate(lastDate) : '—'} />
      </div>
      <RateMissing show={cost.missing} />

      <SectionHead
        title=""
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + {t('Add nutrition')}
            </button>
          )
        }
      />

      {editing && f && (
        <FormCard
          title={editing === 'new' ? t('Add nutrition') : t('Edit nutrition')}
          submitLabel={editing === 'new' ? t('Save') : t('Save changes')}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label={t('Date given')}>
            <input id="nu-date" className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label={t('Fertilizer / product')}>
            <input
              id="nu-product"
              className="input"
              list="nutrition-products"
              value={f.product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder={t('e.g. NPK 20-20-20')}
            />
            <datalist id="nutrition-products">
              {products.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label={t('Unit')}>
            <div className="segmented" role="radiogroup">
              {(['kg', 'L'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={f.unit === u}
                  className={f.unit === u ? 'is-on' : ''}
                  onClick={() => setF({ ...f, unit: u })}
                >
                  {u === 'kg' ? t('Kilograms (kg)') : t('Litres (L)')}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('Quantity per hectare ({unit}/ha)', { unit: unitLabel(f.unit) })}>
            <input id="nu-rate" className="input" inputMode="decimal" value={f.ratePerHa} onChange={(e) => setF({ ...f, ratePerHa: e.target.value })} />
          </Field>
          <Field
            label={t('Area treated (ha)')}
            hint={crop.areaHa ? t('Crop area is {n} ha', { n: formatNumber(crop.areaHa) }) : undefined}
          >
            <input id="nu-area" className="input" inputMode="decimal" value={f.areaHa} onChange={(e) => setF({ ...f, areaHa: e.target.value })} />
          </Field>
          <Field label={t('Price per {unit} (optional)', { unit: unitLabel(f.unit) })}>
            <MoneyInput
              id="nu-price"
              value={f.pricePerUnit}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, pricePerUnit: v })}
            />
          </Field>
          <Computed
            label={t('Total amount used')}
            value={totalAmount !== null ? `${formatNumber(totalAmount, 3)} ${unitLabel(f.unit)}` : '—'}
            note={
              rate !== null && area !== null
                ? `${formatNumber(rate, 3)} ${unitLabel(f.unit)}/${t('ha')} × ${formatNumber(area, 3)} ${t('ha')}`
                : t('Quantity per hectare × area')
            }
          />
          <Computed
            label={t('Total cost')}
            value={cur.both(totalCost, f.currency)}
            note={
              totalAmount !== null && price !== null
                ? `${formatNumber(totalAmount, 3)} ${unitLabel(f.unit)} × ${cur.fmt(price, f.currency)}`
                : t('Add a price to calculate cost')
            }
          />
          <Field label={t('Note (optional)')} wide>
            <input id="nu-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {list.length === 0 ? (
        !editing && <Empty title={t('No nutrition recorded yet')}>{t('Add each time fertilizer or nutrients are given.')}</Empty>
      ) : (
        <div className="day-groups">
          {groupByDate(list, (r) => r.date).map(([date, rows]) => (
            <section key={date} className="day-group">
              <DayHeading date={date} />
              <ul className="records">
                {rows.map((r) => (
                  <li key={r.id} className="card record">
                    <div className="record-main">
                      <span className="record-title">
                        {r.product} · {formatNumber(r.totalAmount, 3)} {unitLabel(r.unit)}
                      </span>
                      <span className="record-sub">
                        {t('{rate} {unit}/ha on {area} ha', {
                          rate: formatNumber(r.ratePerHa, 3),
                          unit: unitLabel(r.unit),
                          area: formatNumber(r.areaHa, 3),
                        })}
                      </span>
                      <span className="record-sub">
                        {r.totalCost !== null
                          ? `${cur.both(r.totalCost, r.currency)} · ${cur.fmt(r.pricePerUnit, r.currency)}/${unitLabel(r.unit)}`
                          : t('No price entered')}
                        {r.note ? ` · ${r.note}` : ''}
                      </span>
                      <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
                    </div>
                    <div className="record-actions">
                      <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                        {t('Edit')}
                      </button>
                      <DeleteButton onDelete={() => removeRecord('nutrition', r.id)} />
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
