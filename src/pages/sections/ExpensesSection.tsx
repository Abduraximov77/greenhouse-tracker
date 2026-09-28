import { useEffect, useState } from 'react'
import {
  addRecord,
  byDateDesc,
  groupByDate,
  payment,
  removeRecord,
  updateRecord,
  useDB,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type PayStatus,
  type SeasonCrop,
} from '../../lib/store'
import { formatNumber, todayISO } from '../../lib/format'
import { useCurrency } from '../../lib/money'
import { useT } from '../../lib/i18n'
import { PaymentControl } from '../../components/PaymentControl'
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

type Filter = ExpenseCategory | 'all'

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  seedlings: 'Seedlings',
  nutrition: 'Fertilizer & nutrition',
  fuel: 'Fuel',
  repairs: 'Repairs',
  other: 'Other',
}

type Form = {
  category: ExpenseCategory
  date: string
  name: string
  quantity: string
  unit: string
  amount: string
  currency: string
  payStatus: PayStatus
  paidAmount: number | null
  note: string
}

export function ExpensesSection({ crop, filter: filterFromLink }: { crop: SeasonCrop; filter?: string }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
  const asFilter = (v?: string): Filter => (EXPENSE_CATEGORIES.includes(v as ExpenseCategory) ? (v as ExpenseCategory) : 'all')
  const [filter, setFilter] = useState<Filter>(asFilter(filterFromLink))
  useEffect(() => setFilter(asFilter(filterFromLink)), [filterFromLink])
  const cropList = db.expenses.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const list = filter === 'all' ? cropList : cropList.filter((r) => r.category === filter)
  const all = [...db.expenses].sort(byDateDesc((r) => r.date))
  const names = [...new Set(all.map((r) => r.name).filter(Boolean))]
  const units = [...new Set(['kg', 'l', 'dona', 'm', ...all.map((r) => r.unit).filter(Boolean)])]
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)

  function open(rec?: Expense) {
    setError(null)
    if (!rec) {
      const category: ExpenseCategory = filter === 'all' ? 'other' : filter
      setF({
        category,
        date: todayISO(),
        name: category === 'seedlings' ? t('Seedlings') : '',
        quantity: '',
        unit: '',
        amount: '',
        currency: all[0]?.currency ?? cur.display,
        payStatus: 'paid',
        paidAmount: null,
        note: '',
      })
      setEditing('new')
    } else {
      setF({
        category: rec.category,
        date: rec.date,
        name: rec.name,
        quantity: str(rec.quantity),
        unit: rec.unit,
        amount: str(rec.amount),
        currency: rec.currency,
        payStatus: rec.payStatus,
        paidAmount: rec.paidAmount,
        note: rec.note,
      })
      setEditing(rec.id)
    }
  }

  /** Typing a product used before fills in its last unit and currency. */
  function setName(name: string) {
    if (!f) return
    const last = all.find((r) => r.name.toLowerCase() === name.trim().toLowerCase())
    if (last && editing === 'new' && !f.unit) setF({ ...f, name, unit: last.unit, currency: last.currency })
    else setF({ ...f, name })
  }

  const amount = f ? num(f.amount) : null
  const qty = f ? num(f.quantity) : null

  function submit() {
    if (!f) return
    if (!f.date) return setError(t('Enter the date.'))
    if (!f.name.trim()) return setError(t('Enter what was bought or paid for.'))
    if (amount === null || amount < 0) return setError(t('Enter how much was spent.'))
    const data = {
      cropId: crop.id,
      category: f.category,
      date: f.date,
      name: f.name.trim(),
      quantity: qty,
      unit: f.unit.trim(),
      amount,
      currency: f.currency,
      payStatus: f.payStatus,
      paidAmount: f.payStatus === 'partial' ? f.paidAmount : null,
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('expenses', data)
    else if (editing) updateRecord('expenses', editing, data)
    setEditing(null)
  }

  const spent = cur.sum(list.map((r) => ({ amount: r.amount, currency: r.currency })))
  const paid = cur.sum(list.map((r) => ({ amount: payment(r.amount, r.payStatus, r.paidAmount).paid, currency: r.currency })))
  const owed = spent.total - paid.total
  const today = cur.sum(list.filter((r) => r.date === todayISO()).map((r) => ({ amount: r.amount, currency: r.currency })))

  return (
    <>
      <div className="stat-grid">
        <Stat label={t('Spent today')} value={cur.fmt(today.total)} />
        <Stat label={filter === 'all' ? t('Spent this season') : t(CATEGORY_LABELS[filter])} value={cur.fmt(spent.total)} />
        <Stat label={t('Paid')} value={cur.fmt(paid.total)} tone={paid.total > 0 ? 'good' : undefined} />
        <Stat label={t('Still to pay')} value={cur.fmt(owed)} tone={owed > 0 ? 'warn' : undefined} />
      </div>
      <RateMissing show={spent.missing} />

      <div className="chip-row" role="tablist" aria-label={t('Category')}>
        {(['all', ...EXPENSE_CATEGORIES] as Filter[]).map((c) => {
          const items = c === 'all' ? cropList : cropList.filter((r) => r.category === c)
          const total = cur.sum(items.map((r) => ({ amount: r.amount, currency: r.currency }))).total
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={filter === c}
              className={`chip${filter === c ? ' is-on' : ''}`}
              onClick={() => setFilter(c)}
            >
              <span>{c === 'all' ? t('All') : t(CATEGORY_LABELS[c])}</span>
              {items.length > 0 && <small>{cur.fmt(total)}</small>}
            </button>
          )
        })}
      </div>

      <SectionHead
        title=""
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + {t('Add expense')}
            </button>
          )
        }
      />

      {editing && f && (
        <FormCard
          title={editing === 'new' ? t('Add expense') : t('Edit expense')}
          submitLabel={editing === 'new' ? t('Save') : t('Save changes')}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <div className="field field-wide">
            <span className="field-label">{t('Category')}</span>
            <div className="chip-row chip-row-form" role="radiogroup" aria-label={t('Category')}>
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={f.category === c}
                  className={`chip${f.category === c ? ' is-on' : ''}`}
                  onClick={() => setF({ ...f, category: c })}
                >
                  {t(CATEGORY_LABELS[c])}
                </button>
              ))}
            </div>
          </div>
          <Field label={t('Date')}>
            <input id="xp-date" className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label={t('Product or service')}>
            <input
              id="xp-name"
              className="input"
              list="expense-names"
              value={f.name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g. fuel, plastic film, repairs')}
            />
            <datalist id="expense-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label={t('Quantity (optional)')}>
            <div className="qty-input">
              <input
                id="xp-qty"
                className="input"
                inputMode="decimal"
                value={f.quantity}
                onChange={(e) => setF({ ...f, quantity: e.target.value })}
              />
              <input
                id="xp-unit"
                className="input"
                list="expense-units"
                placeholder={t('unit')}
                aria-label={t('unit')}
                value={f.unit}
                onChange={(e) => setF({ ...f, unit: e.target.value })}
              />
              <datalist id="expense-units">
                {units.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </Field>
          {f.category === 'nutrition' && (
            <PerHectare
              areaHa={crop.areaHa}
              onQuantity={(q) => setF({ ...f, quantity: String(q) })}
            />
          )}
          <Field label={t('Amount spent')}>
            <MoneyInput
              id="xp-amount"
              value={f.amount}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, amount: v })}
            />
          </Field>
          <Computed
            label={t('Price per unit')}
            value={qty && amount !== null ? `${cur.fmt(amount / qty, f.currency)}${f.unit ? ` / ${f.unit}` : ''}` : '—'}
            note={qty && amount !== null ? `${cur.fmt(amount, f.currency)} ÷ ${formatNumber(qty)} ${f.unit}` : t('Amount ÷ quantity')}
          />
          <div className="field field-wide">
            <span className="field-label">{t('Payment')}</span>
            <PaymentControl
              id="xp"
              due={amount ?? 0}
              currency={f.currency}
              status={f.payStatus}
              paidAmount={f.paidAmount}
              onChange={(payStatus, paidAmount) => setF({ ...f, payStatus, paidAmount })}
            />
          </div>
          <Field label={t('Note (optional)')} wide>
            <input id="xp-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {list.length === 0 ? (
        !editing && <Empty title={t('No expenses recorded yet')}>{t('Add anything you buy or pay for, with its amount.')}</Empty>
      ) : (
        <div className="day-groups">
          {groupByDate(list, (r) => r.date).map(([date, rows]) => {
            const dayTotal = cur.sum(rows.map((r) => ({ amount: r.amount, currency: r.currency })))
            return (
              <section key={date} className="day-group">
                <DayHeading date={date} right={cur.fmt(dayTotal.total)} />
                <ul className="records">
                  {rows.map((r) => {
                    const p = payment(r.amount, r.payStatus, r.paidAmount)
                    return (
                      <li key={r.id} className="card record">
                        <div className="record-main">
                          <span className="cat-tag">{t(CATEGORY_LABELS[r.category])}</span>
                          <span className="record-title">
                            {r.name}
                            {r.quantity !== null && ` · ${formatNumber(r.quantity)} ${r.unit}`} · {cur.both(r.amount, r.currency)}{' '}
                            <span className={`pay-badge ${r.payStatus}`}>
                              {r.payStatus === 'paid' ? t('Paid') : r.payStatus === 'partial' ? t('Partly') : t('Not paid')}
                            </span>
                          </span>
                          {r.payStatus !== 'paid' && (
                            <span className="record-sub text-owed">
                              {t('Still to pay: {amount}', { amount: cur.fmt(p.owed, r.currency) })}
                              {r.payStatus === 'partial' && ` · ${t('Paid')}: ${cur.fmt(p.paid, r.currency)}`}
                            </span>
                          )}
                          {r.note && <span className="record-sub">{r.note}</span>}
                          <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
                        </div>
                        <div className="record-actions">
                          <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                            {t('Edit')}
                          </button>
                          <DeleteButton onDelete={() => removeRecord('expenses', r.id)} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

/** Optional helper for fertilizer: quantity per hectare × area fills in the total quantity. */
function PerHectare({ areaHa, onQuantity }: { areaHa: number | null; onQuantity: (q: number) => void }) {
  const t = useT()
  const [rate, setRate] = useState('')
  const [area, setArea] = useState(str(areaHa))
  const update = (r: string, a: string) => {
    const rn = num(r)
    const an = num(a)
    if (rn !== null && an !== null) onQuantity(Math.round(rn * an * 1000) / 1000)
  }
  return (
    <div className="field field-wide per-ha">
      <span className="field-label">{t('Per hectare (optional)')}</span>
      <div className="per-ha-row">
        <input
          id="xp-rate"
          className="input"
          inputMode="decimal"
          placeholder={t('per ha')}
          aria-label={t('Quantity per hectare')}
          value={rate}
          onChange={(e) => {
            setRate(e.target.value)
            update(e.target.value, area)
          }}
        />
        <span aria-hidden="true">×</span>
        <input
          id="xp-area"
          className="input"
          inputMode="decimal"
          placeholder={t('ha')}
          aria-label={t('Area treated (ha)')}
          value={area}
          onChange={(e) => {
            setArea(e.target.value)
            update(rate, e.target.value)
          }}
        />
        <span>{t('ha')}</span>
      </div>
      <span className="field-hint">{t('Fills in the quantity: per hectare × area.')}</span>
    </div>
  )
}
