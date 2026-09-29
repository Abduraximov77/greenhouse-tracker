import { useState } from 'react'
import {
  addRecord,
  byDateDesc,
  groupByDate,
  removeRecord,
  updateRecord,
  useDB,
  payment,
  type PayStatus,
  type SeasonCrop,
  type Shipment,
} from '../../lib/store'
import { formatNumber, todayISO } from '../../lib/format'
import { useCurrency } from '../../lib/money'
import { useT } from '../../lib/i18n'
import { PayBadge, PaymentControl } from '../../components/PaymentControl'
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
import { cropTotals } from '../cropTotals'
import { TruckSales } from './TruckSales'

type Form = {
  date: string
  truckNumber: string
  driverName: string
  driverPhone: string
  boxes: string
  deliveryPrice: string
  currency: string
  payStatus: PayStatus
  paidAmount: number | null
  destination: string
  note: string
}

export function ExportSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
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
      setF({
        date: todayISO(),
        truckNumber: '',
        driverName: '',
        driverPhone: '',
        boxes: '',
        deliveryPrice: '',
        currency: allShipments[0]?.currency ?? cur.display,
        payStatus: 'paid',
        paidAmount: null,
        destination: '',
        note: '',
      })
      setEditing('new')
    } else {
      setF({
        date: rec.date,
        truckNumber: rec.truckNumber,
        driverName: rec.driverName,
        driverPhone: rec.driverPhone,
        boxes: str(rec.boxes),
        deliveryPrice: str(rec.deliveryPrice),
        currency: rec.currency,
        payStatus: rec.payStatus,
        paidAmount: rec.paidAmount,
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
    if (!f.date) return setError(t('Enter the date.'))
    if (!f.truckNumber.trim()) return setError(t("Enter the truck's number."))
    if (!f.driverName.trim() && !f.driverPhone.trim()) return setError(t("Enter the driver's name or phone number."))
    if (boxes === null || boxes <= 0 || !Number.isInteger(boxes)) return setError(t('Enter the number of boxes (a whole number).'))
    if (price === null || price < 0) return setError(t('Enter the delivery price (0 if free).'))
    const data = {
      cropId: crop.id,
      date: f.date,
      truckNumber: f.truckNumber.trim().toUpperCase(),
      driverName: f.driverName.trim(),
      driverPhone: f.driverPhone.trim(),
      boxes,
      deliveryPrice: price,
      currency: f.currency,
      payStatus: f.payStatus,
      paidAmount: f.payStatus === 'partial' ? f.paidAmount : null,
      destination: f.destination.trim(),
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('shipments', data)
    else if (editing) updateRecord('shipments', editing, data)
    setEditing(null)
  }

  const delivery = cur.sum(list.map((r) => ({ amount: r.deliveryPrice, currency: r.currency })))
  const deliveryPaid = cur.sum(list.map((r) => ({ amount: payment(r.deliveryPrice, r.payStatus, r.paidAmount).paid, currency: r.currency })))

  return (
    <>
      <div className="stat-grid">
        <Stat label={t('Boxes in stock')} value={formatNumber(totals.boxesInStock, 0)} tone={totals.boxesInStock < 0 ? 'warn' : undefined} />
        <Stat label={t('Boxes exported')} value={formatNumber(totals.boxesExported, 0)} />
        <Stat label={t('Trucks sent')} value={formatNumber(totals.trucks, 0)} />
        <Stat label={t('Delivery cost')} value={cur.fmt(delivery.total)} />
        <Stat
          label={t('Delivery still to pay')}
          value={cur.fmt(delivery.total - deliveryPaid.total)}
          tone={delivery.total - deliveryPaid.total > 0 ? 'warn' : undefined}
        />
      </div>
      <RateMissing show={delivery.missing} />
      {list.length > 0 && (
        <div className="stat-grid sales-stats">
          <Stat label={t('Boxes sold')} value={`${formatNumber(totals.boxesSold, 0)} / ${formatNumber(totals.boxesExported, 0)}`} />
          <Stat label={t('Sales')} value={cur.fmt(totals.salesTotal)} tone={totals.salesTotal > 0 ? 'good' : undefined} />
          <Stat label={t('Received from buyers')} value={cur.fmt(totals.salesReceived)} />
          <Stat label={t('Buyers still owe')} value={cur.fmt(totals.buyersOwe)} tone={totals.buyersOwe > 0.005 ? 'warn' : undefined} />
        </div>
      )}

      <SectionHead
        title=""
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + {t('Add truck')}
            </button>
          )
        }
      />

      {editing && f && (
        <FormCard
          title={editing === 'new' ? t('Add truck') : t('Edit truck')}
          submitLabel={editing === 'new' ? t('Save') : t('Save changes')}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label={t('Date')}>
            <input id="ex-date" className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label={t('Truck number')} hint={t('Known trucks fill in the driver for you')}>
            <input
              id="ex-truck"
              className="input"
              list="truck-numbers"
              value={f.truckNumber}
              onChange={(e) => setTruck(e.target.value)}
              autoCapitalize="characters"
            />
            <datalist id="truck-numbers">
              {trucks.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label={t("Driver's name")}>
            <input id="ex-driver" className="input" value={f.driverName} onChange={(e) => setF({ ...f, driverName: e.target.value })} />
          </Field>
          <Field label={t("Driver's phone")}>
            <input id="ex-phone" className="input" type="tel" value={f.driverPhone} onChange={(e) => setF({ ...f, driverPhone: e.target.value })} />
          </Field>
          <Field
            label={t('Boxes loaded')}
            hint={
              boxes !== null && boxes > available ? (
                <span className="text-warn">
                  {t('More than the {n} boxes in stock. Check the harvest records.', { n: formatNumber(available, 0) })}
                </span>
              ) : (
                t('In stock: {n} boxes', { n: formatNumber(available, 0) })
              )
            }
          >
            <input id="ex-boxes" className="input" inputMode="numeric" value={f.boxes} onChange={(e) => setF({ ...f, boxes: e.target.value })} />
          </Field>
          <Field label={t('Delivery price')}>
            <MoneyInput
              id="ex-price"
              value={f.deliveryPrice}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, deliveryPrice: v })}
            />
          </Field>
          <Field label={t('Destination (optional)')}>
            <input
              id="ex-dest"
              className="input"
              list="destinations"
              value={f.destination}
              onChange={(e) => setF({ ...f, destination: e.target.value })}
            />
            <datalist id="destinations">
              {destinations.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Computed
            label={t('Delivery cost per box')}
            value={boxes && price !== null ? cur.both(price / boxes, f.currency) : '—'}
            note={
              boxes && price !== null
                ? `${cur.fmt(price, f.currency)} ÷ ${formatNumber(boxes, 0)}`
                : t('Delivery price ÷ boxes')
            }
          />
          <div className="field field-wide">
            <span className="field-label">{t('Delivery payment')}</span>
            <PaymentControl
              id="ex-pay"
              due={price ?? 0}
              currency={f.currency}
              status={f.payStatus}
              paidAmount={f.paidAmount}
              onChange={(payStatus, paidAmount) => setF({ ...f, payStatus, paidAmount })}
            />
          </div>
          <Field label={t('Note (optional)')} wide>
            <input id="ex-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {list.length === 0 ? (
        !editing && <Empty title={t('No trucks recorded yet')}>{t('Add each truck that leaves with boxes for export.')}</Empty>
      ) : (
        <div className="day-groups">
          {groupByDate(list, (r) => r.date).map(([date, rows]) => (
            <section key={date} className="day-group">
              <DayHeading date={date} right={t('{n} boxes', { n: formatNumber(rows.reduce((a, r) => a + r.boxes, 0), 0) })} />
              <ul className="records">
                {rows.map((r) => (
                  <li key={r.id} className="card record">
                    <div className="record-main">
                      <span className="record-title">
                        <span className="plate">{r.truckNumber}</span> {t('{n} boxes', { n: formatNumber(r.boxes, 0) })} ·{' '}
                        {cur.both(r.deliveryPrice, r.currency)}{' '}
                        <PayBadge due={r.deliveryPrice} currency={r.currency} status={r.payStatus} paidAmount={r.paidAmount} />
                      </span>
                      {r.destination && <span className="record-sub">{t('To {place}', { place: r.destination })}</span>}
                      <span className="record-sub">
                        {t('Driver')}: {r.driverName || '—'}
                        {r.driverPhone && ` · ${r.driverPhone}`}
                        {r.note ? ` · ${r.note}` : ''}
                      </span>
                      <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
                    </div>
                    <div className="record-actions">
                      <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                        {t('Edit')}
                      </button>
                      <DeleteButton onDelete={() => removeRecord('shipments', r.id)} />
                    </div>
                    <TruckSales truck={r} />
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
