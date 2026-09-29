import { useState } from 'react'
import { addRecord, byDateDesc, payment, removeRecord, updateRecord, useDB, type PayStatus, type Sale, type Shipment } from '../../lib/store'
import { formatDate, formatNumber, todayISO } from '../../lib/format'
import { useCurrency } from '../../lib/money'
import { useT } from '../../lib/i18n'
import { PayBadge, PaymentControl } from '../../components/PaymentControl'
import { DeleteButton, MoneyInput, num, str } from '../../components/ui'

type Form = {
  date: string
  boxes: string
  kg: string
  price: string
  currency: string
  buyer: string
  payStatus: PayStatus
  paidAmount: number | null
  note: string
}

/** Sales from one truck: how many boxes were sold, for how much, to whom, and whether the buyer has paid. */
export function TruckSales({ truck }: { truck: Shipment }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
  const sales = db.sales.filter((r) => r.shipmentId === truck.id).sort(byDateDesc((r) => r.date))
  const allSales = [...db.sales].sort(byDateDesc((r) => r.date))
  const buyers = [...new Set(allSales.map((r) => r.buyer).filter(Boolean))]

  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sold = sales.reduce((a, r) => a + r.boxes, 0)
  const left = truck.boxes - sold
  // Weight: known only if the truck's total weight was entered.
  const truckKg = truck.totalKg ?? null
  const kgPerBox = truckKg && truck.boxes ? truckKg / truck.boxes : null
  const soldKg = sales.reduce((a, r) => a + (r.kg ?? 0), 0)
  const leftKg = truckKg !== null ? Math.max(0, truckKg - soldKg) : null
  const kgFor = (b: number) => (kgPerBox ? String(Math.round(b * kgPerBox)) : '')
  // Once the kg is typed by hand, changing the boxes no longer changes it.
  const [kgTouched, setKgTouched] = useState(false)
  const total = cur.sum(sales.map((r) => ({ amount: r.amount, currency: r.currency })))
  const received = cur.sum(sales.map((r) => ({ amount: payment(r.amount, r.payStatus, r.paidAmount).paid, currency: r.currency })))
  const owed = total.total - received.total

  function open(rec?: Sale) {
    setError(null)
    setKgTouched(!!rec)
    const last = allSales[0]
    setF(
      rec
        ? {
            date: rec.date,
            boxes: str(rec.boxes),
            kg: str(rec.kg ?? null),
            price: str(rec.pricePerKg ?? null),
            currency: rec.currency,
            buyer: rec.buyer,
            payStatus: rec.payStatus,
            paidAmount: rec.paidAmount,
            note: rec.note,
          }
        : {
            date: todayISO(),
            boxes: left > 0 ? String(left) : '',
            // The rest of the load: exact remaining kg if all remaining boxes are sold.
            kg: leftKg !== null ? String(Math.round(leftKg)) : '',
            price: str(last?.pricePerKg ?? null),
            currency: last?.currency ?? 'USD',
            buyer: sales[0]?.buyer ?? '',
            payStatus: 'unpaid',
            paidAmount: null,
            note: '',
          },
    )
    setEditing(rec ? rec.id : 'new')
  }

  const boxes = f ? num(f.boxes) : null
  const kg = f ? num(f.kg) : null
  const price = f ? num(f.price) : null
  const amount = kg !== null && price !== null ? Math.round(kg * price * 100) / 100 : null
  // Boxes that can still be sold from this truck (when editing, this sale's own boxes count as available).
  const editingBoxes = editing && editing !== 'new' ? (sales.find((r) => r.id === editing)?.boxes ?? 0) : 0
  const canSell = left + editingBoxes

  function submit() {
    if (!f) return
    if (!f.date) return setError(t('Enter the date.'))
    if (boxes === null || boxes <= 0 || !Number.isInteger(boxes)) return setError(t('Enter the number of boxes (a whole number).'))
    if (boxes > canSell) return setError(t('Only {n} boxes are left on this truck.', { n: formatNumber(canSell, 0) }))
    if (kg === null || kg <= 0) return setError(t('Enter the weight sold in kg.'))
    const editingKg = editing && editing !== 'new' ? (sales.find((r) => r.id === editing)?.kg ?? 0) : 0
    if (leftKg !== null && kg > leftKg + editingKg + 0.5)
      return setError(t('Only {n} kg are left on this truck.', { n: formatNumber(leftKg + editingKg, 0) }))
    if (price === null || price < 0) return setError(t('Enter the price per kg.'))
    const data = {
      cropId: truck.cropId,
      shipmentId: truck.id,
      date: f.date,
      boxes,
      kg,
      pricePerKg: price,
      pricePerBox: null,
      amount: amount ?? 0,
      currency: f.currency,
      buyer: f.buyer.trim(),
      payStatus: f.payStatus,
      paidAmount: f.payStatus === 'partial' ? f.paidAmount : null,
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('sales', data)
    else if (editing) updateRecord('sales', editing, data)
    setEditing(null)
  }

  return (
    <div className="truck-sales">
      <div className="truck-sales-head">
        <div className="truck-sales-sum">
          <span>
            {t('Sold')}: <b>{formatNumber(sold, 0)}</b> / {formatNumber(truck.boxes, 0)} {t('boxes')}
            {soldKg > 0 && (
              <>
                {' · '}
                <b>{formatNumber(soldKg, 0)}</b>
                {truckKg ? ` / ${formatNumber(truckKg, 0)}` : ''} {t('kg')}
              </>
            )}
          </span>
          {left > 0 && sold > 0 && (
            <span>
              {t('Left')}: <b>{formatNumber(left, 0)}</b> {t('boxes')}
              {leftKg !== null && soldKg > 0 && ` · ${formatNumber(leftKg, 0)} ${t('kg')}`}
            </span>
          )}
          {sales.length > 0 && (
            <>
              <span>
                {t('Sales')}: <b>{cur.fmt(total.total)}</b>
              </span>
              <span className={owed > 0.005 ? 'text-owed' : 'text-income'}>
                {owed > 0.005 ? (
                  <>
                    {t('Buyer still owes')}: <b>{cur.fmt(owed)}</b>
                  </>
                ) : (
                  <b>✓ {t('Buyer has paid')}</b>
                )}
              </span>
            </>
          )}
          {left <= 0 && <span className="pay-badge paid">✓ {t('All sold')}</span>}
        </div>
        {!editing && left > 0 && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => open()}>
            + {t('Add sale')}
          </button>
        )}
      </div>

      {editing && f && (
        <form
          className="sale-form"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label className="mini-field">
            <span>{t('Date')}</span>
            <input id={`sale-date-${truck.id}`} className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
          <label className="mini-field">
            <span>{t('Boxes sold')}</span>
            <input
              id={`sale-boxes-${truck.id}`}
              className="input"
              inputMode="numeric"
              value={f.boxes}
              placeholder={String(canSell)}
              onChange={(e) => {
                const b = num(e.target.value)
                setF({ ...f, boxes: e.target.value, kg: !kgTouched && b !== null && kgPerBox ? kgFor(b) : f.kg })
              }}
            />
          </label>
          <label className="mini-field">
            <span>{t('Weight, kg')}</span>
            <input
              id={`sale-kg-${truck.id}`}
              className="input"
              inputMode="decimal"
              value={f.kg}
              onChange={(e) => {
                setKgTouched(true)
                setF({ ...f, kg: e.target.value })
              }}
            />
            {kgPerBox && <small className="mini-hint">{t('≈ {kg} kg per box', { kg: formatNumber(kgPerBox, 2) })}</small>}
          </label>
          <label className="mini-field sale-price">
            <span>{t('Price per kg')}</span>
            <MoneyInput
              id={`sale-price-${truck.id}`}
              value={f.price}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, price: v })}
            />
          </label>
          <div className="sale-total">
            <span>{t('Total')}</span>
            <b>{amount !== null ? cur.both(amount, f.currency) : '—'}</b>
          </div>
          <label className="mini-field sale-buyer">
            <span>{t('Buyer (optional)')}</span>
            <input
              id={`sale-buyer-${truck.id}`}
              className="input"
              list={`sale-buyers-${truck.id}`}
              value={f.buyer}
              onChange={(e) => setF({ ...f, buyer: e.target.value })}
            />
            <datalist id={`sale-buyers-${truck.id}`}>
              {buyers.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="mini-field sale-note">
            <span>{t('Note (optional)')}</span>
            <input id={`sale-note-${truck.id}`} className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
          <div className="sale-pay">
            <span className="field-label">{t('Has the buyer paid?')}</span>
            <PaymentControl
              id={`sale-pay-${truck.id}`}
              due={amount ?? 0}
              currency={f.currency}
              status={f.payStatus}
              paidAmount={f.paidAmount}
              onChange={(payStatus, paidAmount) => setF({ ...f, payStatus, paidAmount })}
            />
          </div>
          {error && <p className="form-error sale-error">{error}</p>}
          <div className="sale-actions">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(null)}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn btn-primary btn-small">
              {editing === 'new' ? t('Save') : t('Save changes')}
            </button>
          </div>
        </form>
      )}

      {sales.length > 0 && (
        <ul className="sale-list">
          {sales.map((r) => (
            <li key={r.id}>
              <div className="sale-line">
                <span>
                  {formatDate(r.date)} · <b>{t('{n} boxes', { n: formatNumber(r.boxes, 0) })}</b>
                  {r.kg ? (
                    <>
                      {' · '}
                      <b>
                        {formatNumber(r.kg, 0)} {t('kg')}
                      </b>{' '}
                      × {cur.fmt(r.pricePerKg ?? 0, r.currency)}/{t('kg')}
                    </>
                  ) : (
                    <> × {cur.fmt(r.pricePerBox ?? 0, r.currency)}</>
                  )}{' '}
                  ={' '}
                  <b>{cur.both(r.amount, r.currency)}</b>
                  {r.buyer && ` · ${r.buyer}`}{' '}
                  <PayBadge due={r.amount} currency={r.currency} status={r.payStatus} paidAmount={r.paidAmount} />
                </span>
                {r.note && <small>{r.note}</small>}
              </div>
              <div className="record-actions">
                <button type="button" className="btn btn-ghost btn-small" onClick={() => open(r)}>
                  {t('Edit')}
                </button>
                <DeleteButton onDelete={() => removeRecord('sales', r.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
