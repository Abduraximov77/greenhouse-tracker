import { useState } from 'react'
import {
  addRecord,
  byDateDesc,
  removeRecord,
  updateRecord,
  useDB,
  type AmountUnit,
  type Nutrition,
  type SeasonCrop,
} from '../../lib/store'
import { formatDate, formatNumber, round, todayISO, useMoney } from '../../lib/format'
import { Computed, DeleteButton, Empty, Field, FormCard, SectionHead, Stamp, Stat, num, str } from '../../components/ui'

type Form = {
  date: string
  product: string
  unit: AmountUnit
  ratePerHa: string
  areaHa: string
  pricePerUnit: string
  note: string
}

export function NutritionSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const money = useMoney()
  const list = db.nutrition.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const products = [...new Set(db.nutrition.map((r) => r.product).filter(Boolean))]
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        note: rec.note,
      })
      setEditing(rec.id)
    }
  }

  /** When a known product is typed, reuse its last unit, rate and price. */
  function setProduct(product: string) {
    if (!f) return
    const last = [...db.nutrition].sort(byDateDesc((r) => r.date)).find((r) => r.product === product)
    if (last && editing === 'new') {
      setF({ ...f, product, unit: last.unit, ratePerHa: str(last.ratePerHa), pricePerUnit: str(last.pricePerUnit) })
    } else setF({ ...f, product })
  }

  const rate = f ? num(f.ratePerHa) : null
  const area = f ? num(f.areaHa) : null
  const price = f ? num(f.pricePerUnit) : null
  const totalAmount = rate !== null && area !== null ? round(rate * area, 3) : null
  const totalCost = totalAmount !== null && price !== null ? round(totalAmount * price) : null

  function submit() {
    if (!f) return
    if (!f.date) return setError('Enter the date.')
    if (!f.product.trim()) return setError('Enter the fertilizer or product name.')
    if (rate === null || rate <= 0) return setError('Enter the quantity per hectare.')
    if (area === null || area <= 0) return setError('Enter the area in hectares.')
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
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('nutrition', data)
    else if (editing) updateRecord('nutrition', editing, data)
    // Remember the area on the crop if it wasn't set yet.
    if (!crop.areaHa) updateRecord('crops', crop.id, { areaHa: area })
    setEditing(null)
  }

  const cost = list.reduce((a, r) => a + (r.totalCost ?? 0), 0)
  const lastDate = list[0]?.date

  return (
    <>
      <div className="stat-grid">
        <Stat label="Applications" value={formatNumber(list.length, 0)} />
        <Stat label="Total cost" value={money(cost)} />
        <Stat label="Last given" value={lastDate ? formatDate(lastDate) : '—'} />
      </div>

      <SectionHead
        title="Nutrition given"
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + Add nutrition
            </button>
          )
        }
      />

      {editing && f && (
        <FormCard
          title={editing === 'new' ? 'Add nutrition' : 'Edit nutrition'}
          submitLabel={editing === 'new' ? 'Save' : 'Save changes'}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label="Date given">
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Fertilizer / product">
            <input
              className="input"
              list="nutrition-products"
              value={f.product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. NPK 20-20-20"
            />
            <datalist id="nutrition-products">
              {products.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Unit">
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
                  {u === 'kg' ? 'Kilograms (kg)' : 'Litres (L)'}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Quantity per hectare (${f.unit}/ha)`}>
            <input className="input" inputMode="decimal" value={f.ratePerHa} onChange={(e) => setF({ ...f, ratePerHa: e.target.value })} />
          </Field>
          <Field label="Area treated (ha)" hint={crop.areaHa ? `Crop area is ${formatNumber(crop.areaHa)} ha` : undefined}>
            <input className="input" inputMode="decimal" value={f.areaHa} onChange={(e) => setF({ ...f, areaHa: e.target.value })} />
          </Field>
          <Field label={`Price per ${f.unit} (optional)`}>
            <input className="input" inputMode="decimal" value={f.pricePerUnit} onChange={(e) => setF({ ...f, pricePerUnit: e.target.value })} />
          </Field>
          <Computed
            label="Total amount used"
            value={totalAmount !== null ? `${formatNumber(totalAmount, 3)} ${f.unit}` : '—'}
            note={rate !== null && area !== null ? `${formatNumber(rate, 3)} ${f.unit}/ha × ${formatNumber(area, 3)} ha` : 'Quantity per hectare × area'}
          />
          <Computed
            label="Total cost"
            value={money(totalCost)}
            note={totalAmount !== null && price !== null ? `${formatNumber(totalAmount, 3)} ${f.unit} × ${money(price)}` : 'Add a price to calculate cost'}
          />
          <Field label="Note (optional)" wide>
            <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {list.length === 0 ? (
        !editing && <Empty title="No nutrition recorded yet">Add each time fertilizer or nutrients are given.</Empty>
      ) : (
        <ul className="records">
          {list.map((r) => (
            <li key={r.id} className="card record">
              <div className="record-main">
                <span className="record-title">
                  {r.product} · {formatNumber(r.totalAmount, 3)} {r.unit}
                </span>
                <span className="record-sub">
                  {formatDate(r.date)} · {formatNumber(r.ratePerHa, 3)} {r.unit}/ha on {formatNumber(r.areaHa, 3)} ha
                </span>
                <span className="record-sub">
                  {r.totalCost !== null ? `${money(r.totalCost)} (${money(r.pricePerUnit)}/${r.unit})` : 'No price entered'}
                  {r.note ? ` · ${r.note}` : ''}
                </span>
                <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
              </div>
              <div className="record-actions">
                <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                  Edit
                </button>
                <DeleteButton onDelete={() => removeRecord('nutrition', r.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
