import { useState } from 'react'
import { addRecord, byDateDesc, removeRecord, updateRecord, useDB, type Planting, type SeasonCrop } from '../../lib/store'
import { formatDate, formatNumber, round, todayISO, useMoney } from '../../lib/format'
import { Computed, DeleteButton, Empty, Field, FormCard, SectionHead, Stamp, Stat, num, str } from '../../components/ui'

type Form = {
  arrivedOn: string
  plantedOn: string
  supplier: string
  quantity: string
  unitPrice: string
  totalCost: string
  note: string
}

const blank = (): Form => ({
  arrivedOn: todayISO(),
  plantedOn: '',
  supplier: '',
  quantity: '',
  unitPrice: '',
  totalCost: '',
  note: '',
})

export function PlantingSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const money = useMoney()
  const list = db.plantings.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.arrivedOn))
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form>(blank)
  // Which price field the user typed last: the other one is calculated.
  const [priceMode, setPriceMode] = useState<'unit' | 'total'>('unit')
  const [error, setError] = useState<string | null>(null)

  const qty = num(f.quantity)

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
      // Suggest last supplier and price to save typing.
      const last = list[0]
      setF({ ...blank(), supplier: last?.supplier ?? '', unitPrice: last ? str(last.unitPrice) : '' })
      setEditing('new')
    } else {
      setF({
        arrivedOn: rec.arrivedOn,
        plantedOn: rec.plantedOn,
        supplier: rec.supplier,
        quantity: str(rec.quantity),
        unitPrice: str(rec.unitPrice),
        totalCost: str(rec.totalCost),
        note: rec.note,
      })
      setEditing(rec.id)
    }
  }

  function submit() {
    const quantity = num(f.quantity)
    const unitPrice = num(f.unitPrice)
    const totalCost = num(f.totalCost)
    if (!f.arrivedOn) return setError('Enter the date the seedlings arrived.')
    if (!quantity || quantity <= 0) return setError('Enter how many seedlings (quantity).')
    if (unitPrice === null && totalCost === null) return setError('Enter the price per seedling or the total cost.')
    const data = {
      cropId: crop.id,
      arrivedOn: f.arrivedOn,
      plantedOn: f.plantedOn,
      supplier: f.supplier.trim(),
      quantity,
      unitPrice: unitPrice ?? round((totalCost ?? 0) / quantity, 4),
      totalCost: totalCost ?? round(quantity * (unitPrice ?? 0)),
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('plantings', data)
    else if (editing) updateRecord('plantings', editing, data)
    setEditing(null)
  }

  const totalQty = list.reduce((a, r) => a + r.quantity, 0)
  const totalCost = list.reduce((a, r) => a + r.totalCost, 0)

  return (
    <>
      <div className="stat-grid">
        <Stat label="Seedlings" value={formatNumber(totalQty, 0)} />
        <Stat label="Total cost" value={money(totalCost)} />
        <Stat label="Average per seedling" value={totalQty ? money(totalCost / totalQty) : '—'} />
      </div>

      <SectionHead
        title="Seedlings: arrived & planted"
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + Add seedlings
            </button>
          )
        }
      />

      {editing && (
        <FormCard
          title={editing === 'new' ? 'Add seedlings' : 'Edit seedlings'}
          submitLabel={editing === 'new' ? 'Save' : 'Save changes'}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label="Arrived on">
            <input className="input" type="date" value={f.arrivedOn} onChange={(e) => setF({ ...f, arrivedOn: e.target.value })} />
          </Field>
          <Field label="Planted on" hint="Leave empty if not planted yet">
            <input className="input" type="date" value={f.plantedOn} onChange={(e) => setF({ ...f, plantedOn: e.target.value })} />
          </Field>
          <Field label="Supplier (optional)">
            <input className="input" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
          </Field>
          <Field label="Quantity (seedlings)">
            <input
              className="input"
              inputMode="decimal"
              value={f.quantity}
              onChange={(e) => setF(recalc({ ...f, quantity: e.target.value }, priceMode))}
            />
          </Field>
          <Field label="Price per seedling">
            <input
              className={`input${priceMode === 'total' ? ' is-computed' : ''}`}
              inputMode="decimal"
              value={f.unitPrice}
              onChange={(e) => {
                setPriceMode('unit')
                setF(recalc({ ...f, unitPrice: e.target.value }, 'unit'))
              }}
            />
          </Field>
          <Field label="Total cost" hint="Filled in automatically, or type it and the price per seedling is worked out">
            <input
              className={`input${priceMode === 'unit' ? ' is-computed' : ''}`}
              inputMode="decimal"
              value={f.totalCost}
              onChange={(e) => {
                setPriceMode('total')
                setF(recalc({ ...f, totalCost: e.target.value }, 'total'))
              }}
            />
          </Field>
          <Computed
            label="Total cost"
            value={money(num(f.totalCost))}
            note={qty && num(f.unitPrice) !== null ? `${formatNumber(qty, 0)} seedlings × ${money(num(f.unitPrice))}` : undefined}
          />
          <Field label="Note (optional)" wide>
            <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {list.length === 0 ? (
        !editing && <Empty title="No seedlings recorded yet">Add when seedlings arrive, with their quantity and price.</Empty>
      ) : (
        <ul className="records">
          {list.map((r) => (
            <li key={r.id} className="card record">
              <div className="record-main">
                <span className="record-title">
                  {formatNumber(r.quantity, 0)} seedlings · {money(r.totalCost)}
                </span>
                <span className="record-sub">
                  Arrived {formatDate(r.arrivedOn)} · {r.plantedOn ? `Planted ${formatDate(r.plantedOn)}` : 'Not planted yet'}
                </span>
                <span className="record-sub">
                  {money(r.unitPrice)} each{r.supplier ? ` · ${r.supplier}` : ''}
                  {r.note ? ` · ${r.note}` : ''}
                </span>
                <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
              </div>
              <div className="record-actions">
                <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                  Edit
                </button>
                <DeleteButton onDelete={() => removeRecord('plantings', r.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
