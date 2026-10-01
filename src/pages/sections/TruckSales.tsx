import { useState } from 'react'
import {
  SALE_SIZES,
  addRecord,
  byDateDesc,
  removeRecord,
  updateRecord,
  useDB,
  type Sale,
  type SaleLine,
  type Shipment,
} from '../../lib/store'
import { CURRENCIES, formatDate, formatNumber, todayISO } from '../../lib/format'
import { useCurrency } from '../../lib/money'
import { useT } from '../../lib/i18n'
import { DeleteButton, num, str } from '../../components/ui'

type Row = { boxes: string; kg: string; price: string }
type Form = {
  date: string
  rows: Record<string, Row>
  currency: string
  buyer: string
  note: string
}
const emptyRow = (): Row => ({ boxes: '', kg: '', price: '' })
const emptyRows = () => Object.fromEntries(SALE_SIZES.map((z) => [z, emptyRow()])) as Record<string, Row>

/** "3-lik", "Aralash" … */
export function sizeLabel(size: string, t: (k: string, v?: Record<string, string | number>) => string) {
  return size === 'mix' ? t('Mixed sizes') : t('{n}-size', { n: size })
}

/** Sales from one truck: boxes sold per tomato size, each with its own weight and price, and to whom. */
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
  const soldKg = sales.reduce((a, r) => a + (r.kg ?? 0), 0)
  const leftKg = truckKg !== null ? Math.max(0, truckKg - soldKg) : null
  const total = cur.sum(sales.map((r) => ({ amount: r.amount, currency: r.currency })))

  function open(rec?: Sale) {
    setError(null)
    const last = allSales[0]
    const rows = emptyRows()
    if (rec?.lines?.length) {
      for (const l of rec.lines) rows[l.size] = { boxes: str(l.boxes), kg: str(l.kg), price: str(l.price ?? null) }
    } else if (rec) {
      // older sale, not split by size
      rows.mix = {
        boxes: str(rec.boxes),
        kg: str(rec.kg ?? null),
        price: str(rec.kg ? (rec.pricePerKg ?? null) : (rec.pricePerBox ?? rec.pricePerKg ?? null)),
      }
    } else if (last?.lines?.length) {
      // a new sale starts with the last prices per size
      for (const l of last.lines) rows[l.size] = { ...emptyRow(), price: str(l.price ?? null) }
    }
    setF({
      date: rec?.date ?? todayISO(),
      rows,
      currency: rec?.currency ?? last?.currency ?? 'USD',
      buyer: rec ? rec.buyer : (sales[0]?.buyer ?? ''),
      note: rec?.note ?? '',
    })
    setEditing(rec ? rec.id : 'new')
  }

  // each size line: boxes, optional kg, price per kg (with kg) or per box (without)
  const lines = f
    ? SALE_SIZES.map((size) => {
        const r = f.rows[size]
        const boxes = num(r.boxes)
        const kg = num(r.kg)
        const price = num(r.price)
        const byKg = kg !== null && kg > 0
        const amount = price === null ? null : byKg ? kg! * price : boxes !== null ? boxes * price : null
        const used = !!(r.boxes.trim() || r.kg.trim() || r.price.trim())
        return { size, r, boxes, kg, price, byKg, used, amount: amount === null ? null : Math.round(amount * 100) / 100 }
      })
    : []
  const used = lines.filter((l) => l.used)
  const formBoxes = used.reduce((a, l) => a + (l.boxes ?? 0), 0)
  const formKg = used.reduce((a, l) => a + (l.byKg ? l.kg! : 0), 0)
  const priced = used.filter((l) => l.amount !== null)
  const formAmount = priced.length ? priced.reduce((a, l) => a + l.amount!, 0) : null
  const unpriced = used.length - priced.length
  // Boxes that can still be sold from this truck (when editing, this sale's own boxes count as available).
  const editingRec = editing && editing !== 'new' ? sales.find((r) => r.id === editing) : undefined
  const canSell = left + (editingRec?.boxes ?? 0)

  function setRow(size: string, patch: Partial<Row>) {
    if (!f) return
    setF({ ...f, rows: { ...f.rows, [size]: { ...f.rows[size], ...patch } } })
  }

  function submit() {
    if (!f) return
    if (!f.date) return setError(t('Enter the date.'))
    if (!used.length) return setError(t('Enter the boxes for at least one size.'))
    for (const l of used) {
      const name = sizeLabel(l.size, t)
      if (l.boxes === null || l.boxes <= 0 || !Number.isInteger(l.boxes))
        return setError(`${name}: ${t('Enter the number of boxes (a whole number).')}`)
      if (l.r.kg.trim() && (l.kg === null || l.kg <= 0)) return setError(`${name}: ${t('Enter the weight sold in kg.')}`)
      if (l.r.price.trim() && (l.price === null || l.price < 0)) return setError(`${name}: ${t('Check the price.')}`)
    }
    if (formBoxes > canSell) return setError(t('Only {n} boxes are left on this truck.', { n: formatNumber(canSell, 0) }))
    const editingKg = editingRec?.kg ?? 0
    if (leftKg !== null && formKg > leftKg + editingKg + 0.5)
      return setError(t('Only {n} kg are left on this truck.', { n: formatNumber(leftKg + editingKg, 0) }))
    const saleLines: SaleLine[] = used.map((l) => ({
      size: l.size,
      boxes: l.boxes!,
      kg: l.byKg ? l.kg : null,
      price: l.price,
      amount: l.amount ?? 0,
    }))
    const one = saleLines.length === 1 && saleLines[0].price !== null ? saleLines[0] : null
    const data = {
      cropId: truck.cropId,
      shipmentId: truck.id,
      date: f.date,
      boxes: formBoxes,
      kg: formKg > 0 ? formKg : null,
      // single line: also kept in the old fields so older screens show it right
      pricePerKg: one?.kg ? one.price : null,
      pricePerBox: one && !one.kg ? one.price : null,
      amount: Math.round((formAmount ?? 0) * 100) / 100,
      priceMissing: unpriced > 0,
      currency: f.currency,
      buyer: f.buyer.trim(),
      // Sales count as money received; there is no separate "paid" step.
      payStatus: 'paid' as const,
      paidAmount: null,
      note: f.note.trim(),
      lines: saleLines,
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
          className="sale-form sale-form-sizes"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="sale-top">
            <label className="mini-field">
              <span>{t('Date')}</span>
              <input
                id={`sale-date-${truck.id}`}
                className="input"
                type="date"
                value={f.date}
                onChange={(e) => setF({ ...f, date: e.target.value })}
              />
            </label>
            <label className="mini-field">
              <span>{t('Currency')}</span>
              <select
                id={`sale-cur-${truck.id}`}
                className="input"
                value={f.currency}
                onChange={(e) => setF({ ...f, currency: e.target.value })}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <p className="mini-hint sale-left">
              {t('Left on the truck')}: <b>{formatNumber(canSell, 0)}</b> {t('boxes')}
              {leftKg !== null && ` · ${formatNumber(leftKg + (editingRec?.kg ?? 0), 0)} ${t('kg')}`}
            </p>
          </div>

          <div className="size-table" role="table">
            <div className="size-row size-head" role="row">
              <span>{t('Size')}</span>
              <span>{t('Boxes')}</span>
              <span>{t('Weight, kg (optional)')}</span>
              <span>{t('Price (optional)')}</span>
              <span>{t('Sum')}</span>
            </div>
            {lines.map((l) => (
              <div key={l.size} className={`size-row${l.used ? ' is-used' : ''}`} role="row">
                <b className="size-name">{sizeLabel(l.size, t)}</b>
                <input
                  id={`sale-${l.size}-boxes-${truck.id}`}
                  className="input"
                  inputMode="numeric"
                  placeholder={t('boxes')}
                  aria-label={`${sizeLabel(l.size, t)} · ${t('Boxes')}`}
                  value={l.r.boxes}
                  onChange={(e) => setRow(l.size, { boxes: e.target.value })}
                />
                <input
                  id={`sale-${l.size}-kg-${truck.id}`}
                  className="input"
                  inputMode="decimal"
                  aria-label={`${sizeLabel(l.size, t)} · ${t('Weight, kg (optional)')}`}
                  placeholder={t('kg')}
                  value={l.r.kg}
                  onChange={(e) => setRow(l.size, { kg: e.target.value })}
                />
                <label className="size-price">
                  <input
                    id={`sale-${l.size}-price-${truck.id}`}
                    className="input"
                    inputMode="decimal"
                    placeholder={t('Price (optional)')}
                    aria-label={`${sizeLabel(l.size, t)} · ${t(l.byKg ? 'Price per kg' : 'Price per box')}`}
                    value={l.r.price}
                    onChange={(e) => setRow(l.size, { price: e.target.value })}
                  />
                  <small>
                    {f.currency}/{l.byKg ? t('kg') : t('box')}
                  </small>
                </label>
                <span className="size-sum">{l.amount !== null && l.used ? cur.fmt(l.amount, f.currency) : '—'}</span>
              </div>
            ))}
            <div className="size-row size-total" role="row">
              <b>{t('Total')}</b>
              <b>{formatNumber(formBoxes, 0)}</b>
              <b>{formKg > 0 ? `${formatNumber(formKg, 0)} ${t('kg')}` : ''}</b>
              <span />
              <b className="size-sum">
                {formAmount !== null ? cur.both(formAmount, f.currency) : '—'}
                {unpriced > 0 && <small className="size-noprice"> + {t('{n} sizes without a price', { n: unpriced })}</small>}
              </b>
            </div>
          </div>
          <p className="mini-hint">{t('Fill only the sizes you sold. With a weight the price is per kg, without it per box.')}</p>

          <div className="sale-top">
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
                  {r.kg ? ` · ${formatNumber(r.kg, 0)} ${t('kg')}` : ''}
                  {r.amount > 0 && (
                    <>
                      {' '}
                      = <b>{cur.both(r.amount, r.currency)}</b>
                    </>
                  )}
                  {r.priceMissing && <span className="pay-badge partial"> {t('price not entered')}</span>}
                  {r.buyer && ` · ${r.buyer}`}
                </span>
                <small className="sale-sizes">
                  {r.lines?.length
                    ? r.lines
                        .map(
                          (l) =>
                            `${sizeLabel(l.size, t)}: ${formatNumber(l.boxes, 0)} ${t('boxes')}` +
                            (l.kg ? ` · ${formatNumber(l.kg, 0)} ${t('kg')}` : '') +
                            (l.price === null
                              ? ''
                              : (l.kg ? ` × ${cur.fmt(l.price, r.currency)}/${t('kg')}` : ` × ${cur.fmt(l.price, r.currency)}`) +
                                ` = ${cur.fmt(l.amount, r.currency)}`),
                        )
                        .join(' · ')
                    : r.kg
                      ? `${formatNumber(r.kg, 0)} ${t('kg')} × ${cur.fmt(r.pricePerKg ?? 0, r.currency)}/${t('kg')}`
                      : `× ${cur.fmt(r.pricePerBox ?? 0, r.currency)}`}
                </small>
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
