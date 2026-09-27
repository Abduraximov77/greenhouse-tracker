import { useState } from 'react'
import { addRecord, byDateDesc, removeRecord, updateRecord, useDB, type SeasonCrop, type Shipment } from '../../lib/store'
import { formatDate, formatNumber, todayISO, useMoney } from '../../lib/format'
import { Computed, DeleteButton, Empty, Field, FormCard, SectionHead, Stamp, Stat, num, str } from '../../components/ui'
import { cropTotals } from '../cropTotals'

type Form = {
  date: string
  truckNumber: string
  driverName: string
  driverPhone: string
  boxes: string
  deliveryPrice: string
  destination: string
  note: string
}

export function ExportSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const money = useMoney()
  const list = db.shipments.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const allShipments = [...db.shipments].sort(byDateDesc((r) => r.date))
  const trucks = [...new Set(allShipments.map((r) => r.truckNumber))]
  const destinations = [...new Set(allShipments.map((r) => r.destination).filter(Boolean))]
  const totals = cropTotals(db, crop.id)

  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)

  function open(rec?: Shipment) {
    setError(null)
    if (!rec) {
      setF({ date: todayISO(), truckNumber: '', driverName: '', driverPhone: '', boxes: '', deliveryPrice: '', destination: '', note: '' })
      setEditing('new')
    } else {
      setF({
        date: rec.date,
        truckNumber: rec.truckNumber,
        driverName: rec.driverName,
        driverPhone: rec.driverPhone,
        boxes: str(rec.boxes),
        deliveryPrice: str(rec.deliveryPrice),
        destination: rec.destination,
        note: rec.note,
      })
      setEditing(rec.id)
    }
  }

  /** Typing a truck number that was used before fills in its driver automatically. */
  function setTruck(truckNumber: string) {
    if (!f) return
    const known = allShipments.find((r) => r.truckNumber.toLowerCase() === truckNumber.trim().toLowerCase())
    if (known && !f.driverName && !f.driverPhone) {
      setF({ ...f, truckNumber, driverName: known.driverName, driverPhone: known.driverPhone })
    } else setF({ ...f, truckNumber })
  }

  const boxes = f ? num(f.boxes) : null
  const price = f ? num(f.deliveryPrice) : null
  // Boxes available for this truck (when editing, this truck's own boxes count as available).
  const editingBoxes = editing && editing !== 'new' ? (list.find((r) => r.id === editing)?.boxes ?? 0) : 0
  const available = totals.boxesInStock + editingBoxes

  function submit() {
    if (!f) return
    if (!f.date) return setError('Enter the date.')
    if (!f.truckNumber.trim()) return setError("Enter the truck's number.")
    if (!f.driverName.trim() && !f.driverPhone.trim()) return setError("Enter the driver's name or phone number.")
    if (boxes === null || boxes <= 0 || !Number.isInteger(boxes)) return setError('Enter the number of boxes (a whole number).')
    if (price === null || price < 0) return setError('Enter the delivery price (0 if free).')
    const data = {
      cropId: crop.id,
      date: f.date,
      truckNumber: f.truckNumber.trim().toUpperCase(),
      driverName: f.driverName.trim(),
      driverPhone: f.driverPhone.trim(),
      boxes,
      deliveryPrice: price,
      destination: f.destination.trim(),
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('shipments', data)
    else if (editing) updateRecord('shipments', editing, data)
    setEditing(null)
  }

  return (
    <>
      <div className="stat-grid">
        <Stat label="Boxes in stock" value={formatNumber(totals.boxesInStock, 0)} tone={totals.boxesInStock < 0 ? 'warn' : undefined} />
        <Stat label="Boxes exported" value={formatNumber(totals.boxesExported, 0)} />
        <Stat label="Trucks sent" value={formatNumber(totals.trucks, 0)} />
        <Stat label="Delivery cost" value={money(totals.deliveryCost)} />
      </div>

      <SectionHead
        title="Trucks"
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + Add truck
            </button>
          )
        }
      />

      {editing && f && (
        <FormCard
          title={editing === 'new' ? 'Add truck' : 'Edit truck'}
          submitLabel={editing === 'new' ? 'Save' : 'Save changes'}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label="Date">
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Truck number" hint="Known trucks fill in the driver for you">
            <input className="input" list="truck-numbers" value={f.truckNumber} onChange={(e) => setTruck(e.target.value)} autoCapitalize="characters" />
            <datalist id="truck-numbers">
              {trucks.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Driver's name">
            <input className="input" value={f.driverName} onChange={(e) => setF({ ...f, driverName: e.target.value })} />
          </Field>
          <Field label="Driver's phone">
            <input className="input" type="tel" value={f.driverPhone} onChange={(e) => setF({ ...f, driverPhone: e.target.value })} />
          </Field>
          <Field
            label="Boxes loaded"
            hint={
              boxes !== null && boxes > available ? (
                <span className="text-warn">
                  More than the {formatNumber(available, 0)} boxes in stock. Check the harvest records.
                </span>
              ) : (
                `${formatNumber(available, 0)} boxes in stock`
              )
            }
          >
            <input className="input" inputMode="numeric" value={f.boxes} onChange={(e) => setF({ ...f, boxes: e.target.value })} />
          </Field>
          <Field label="Delivery price">
            <input className="input" inputMode="decimal" value={f.deliveryPrice} onChange={(e) => setF({ ...f, deliveryPrice: e.target.value })} />
          </Field>
          <Field label="Destination (optional)">
            <input className="input" list="destinations" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} />
            <datalist id="destinations">
              {destinations.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Computed
            label="Delivery cost per box"
            value={boxes && price !== null ? money(price / boxes) : '—'}
            note={boxes && price !== null ? `${money(price)} ÷ ${formatNumber(boxes, 0)} boxes` : 'Delivery price ÷ boxes'}
          />
          <Field label="Note (optional)" wide>
            <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {list.length === 0 ? (
        !editing && <Empty title="No trucks recorded yet">Add each truck that leaves with boxes for export.</Empty>
      ) : (
        <ul className="records">
          {list.map((r) => (
            <li key={r.id} className="card record">
              <div className="record-main">
                <span className="record-title">
                  <span className="plate">{r.truckNumber}</span> {formatNumber(r.boxes, 0)} boxes · {money(r.deliveryPrice)}
                </span>
                <span className="record-sub">
                  {formatDate(r.date)}
                  {r.destination ? ` · to ${r.destination}` : ''}
                </span>
                <span className="record-sub">
                  Driver: {r.driverName || '—'}
                  {r.driverPhone && (
                    <>
                      {' · '}
                      <a href={`tel:${r.driverPhone.replace(/[^\d+]/g, '')}`}>{r.driverPhone}</a>
                    </>
                  )}
                  {r.note ? ` · ${r.note}` : ''}
                </span>
                <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
              </div>
              <div className="record-actions">
                <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                  Edit
                </button>
                <DeleteButton onDelete={() => removeRecord('shipments', r.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
