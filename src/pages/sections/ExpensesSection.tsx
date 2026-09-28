import { useState } from 'react'
import {
  addRecord,
  byDateDesc,
  groupByDate,
  payment,
  removeRecord,
  updateRecord,
  useDB,
  type Expense,
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

type Form = {
  date: string
  name: string
  quantity: string
  unit: string
  amount: string
  currency: string
  payStatus: PayStatus
  paidAmount: number | null
  note: string
  forWorkers: boolean
}

/** Names that usually mean a payment to workers (so the "for workers" choice is suggested). */
const WORKER_WORDS = /ishchi|ayol|erkak|ish ?haqi|oylik|kunlik|mardikor|rabo|работ|рабоч|зарплат|worker|labou?r|wage|salary/i

export function ExpensesSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
  const list = db.expenses.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const all = [...db.expenses].sort(byDateDesc((r) => r.date))
  const names = [...new Set(all.map((r) => r.name).filter(Boolean))]
  const units = [...new Set(['kg', 'l', 'dona', 'm', ...all.map((r) => r.unit).filter(Boolean)])]
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)

  function open(rec?: Expense) {
    setError(null)
    setKindTouched(false)
    if (!rec) {
      setF({
        date: todayISO(),
        name: '',
        quantity: '',
        unit: '',
        amount: '',
        currency: all[0]?.currency ?? cur.display,
        payStatus: 'paid',
        paidAmount: null,
        note: '',
        forWorkers: false,
      })
      setEditing('new')
    } else {
      setF({
        date: rec.date,
        name: rec.name,
        quantity: str(rec.quantity),
        unit: rec.unit,
        amount: str(rec.amount),
        currency: rec.currency,
        payStatus: rec.payStatus,
        paidAmount: rec.paidAmount,
        note: rec.note,
        forWorkers: !!rec.forWorkers,
      })
      setEditing(rec.id)
    }
  }

  // Once "for workers" is chosen by hand, the name no longer changes it.
  const [kindTouched, setKindTouched] = useState(false)

  /** Typing a product used before fills in its last unit, currency and kind; worker words suggest "for workers". */
  function setName(name: string) {
    if (!f) return
    const last = all.find((r) => r.name.toLowerCase() === name.trim().toLowerCase())
    const forWorkers = kindTouched || editing !== 'new' ? f.forWorkers : last ? !!last.forWorkers : WORKER_WORDS.test(name)
    if (last && editing === 'new' && !f.unit) setF({ ...f, name, unit: last.unit, currency: last.currency, forWorkers })
    else setF({ ...f, name, forWorkers })
  }

  const amount = f ? num(f.amount) : null
  const qty = f ? num(f.quantity) : null

  function submit() {
    if (!f) return
    if (!f.date) return setError(t('Enter the date.'))
    if (!f.name.trim()) return setError(f.forWorkers ? t('Enter who was paid.') : t('Enter what was bought or paid for.'))
    if (amount === null || amount < 0) return setError(t('Enter how much was spent.'))
    const data = {
      cropId: crop.id,
      date: f.date,
      name: f.name.trim(),
      // Payments to workers have no quantity or unit.
      quantity: f.forWorkers ? null : qty,
      unit: f.forWorkers ? '' : f.unit.trim(),
      amount,
      currency: f.currency,
      payStatus: f.payStatus,
      paidAmount: f.payStatus === 'partial' ? f.paidAmount : null,
      note: f.note.trim(),
      forWorkers: f.forWorkers,
    }
    if (editing === 'new') addRecord('expenses', data)
    else if (editing) updateRecord('expenses', editing, data)
    setEditing(null)
  }

  // The totals here are ordinary expenses only; payments marked "for workers" are counted under Workers.
  const own = list.filter((r) => !r.forWorkers)
  const toWorkers = cur.sum(list.filter((r) => r.forWorkers).map((r) => ({ amount: r.amount, currency: r.currency })))
  const spent = cur.sum(own.map((r) => ({ amount: r.amount, currency: r.currency })))
  const paid = cur.sum(own.map((r) => ({ amount: payment(r.amount, r.payStatus, r.paidAmount).paid, currency: r.currency })))
  const owed = spent.total - paid.total
  const today = cur.sum(own.filter((r) => r.date === todayISO()).map((r) => ({ amount: r.amount, currency: r.currency })))

  return (
    <>
      <div className="stat-grid">
        <Stat label={t('Spent today')} value={cur.fmt(today.total)} />
        <Stat label={t('Spent this season')} value={cur.fmt(spent.total)} />
        <Stat label={t('Paid')} value={cur.fmt(paid.total)} tone={paid.total > 0 ? 'good' : undefined} />
        <Stat label={t('Still to pay')} value={cur.fmt(owed)} tone={owed > 0 ? 'warn' : undefined} />
      </div>
      <RateMissing show={spent.missing} />
      {toWorkers.total > 0 && (
        <p className="field-hint">
          {t('Paid to workers from here: {amount}. It is counted under Workers, not in these totals.', {
            amount: cur.fmt(toWorkers.total),
          })}
        </p>
      )}

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
          <Field label={t('Date')}>
            <input id="xp-date" className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <div className="field field-wide">
            <span className="field-label" id="xp-kind-label">
              {t('What kind of spending')}
            </span>
            <div className="segmented kind-switch" role="radiogroup" aria-labelledby="xp-kind-label">
              {([false, true] as const).map((w) => (
                <button
                  key={String(w)}
                  type="button"
                  role="radio"
                  aria-checked={f.forWorkers === w}
                  className={f.forWorkers === w ? 'is-on is-good' : ''}
                  onClick={() => {
                    setKindTouched(true)
                    setF({ ...f, forWorkers: w })
                  }}
                >
                  {w ? t('For workers') : t('Other expense')}
                </button>
              ))}
            </div>
            {f.forWorkers && (
              <span className="field-hint">
                {t('Counted with the workers’ pay (Workers section and overview), not with other expenses.')}
              </span>
            )}
          </div>
          <Field label={f.forWorkers ? t('Who was paid') : t('Product or service')}>
            <input
              id="xp-name"
              className="input"
              list="expense-names"
              value={f.name}
              onChange={(e) => setName(e.target.value)}
              placeholder={f.forWorkers ? t('e.g. women workers, 5 people') : t('e.g. seedlings, fertilizer, fuel, repairs')}
            />
            <datalist id="expense-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          {!f.forWorkers && (
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
          )}
          <Field label={f.forWorkers ? t('Amount paid') : t('Amount spent')}>
            <MoneyInput
              id="xp-amount"
              value={f.amount}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, amount: v })}
            />
          </Field>
          {!f.forWorkers && (
            <Computed
              label={t('Price per unit')}
              value={qty && amount !== null ? `${cur.fmt(amount / qty, f.currency)}${f.unit ? ` / ${f.unit}` : ''}` : '—'}
              note={qty && amount !== null ? `${cur.fmt(amount, f.currency)} ÷ ${formatNumber(qty)} ${f.unit}` : t('Amount ÷ quantity')}
            />
          )}
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
                      <li key={r.id} className={`card record${r.forWorkers ? ' record-workers' : ''}`}>
                        <div className="record-main">
                          <span className="record-title">
                            {r.name}
                            {r.quantity !== null && ` · ${formatNumber(r.quantity)} ${r.unit}`} · {cur.both(r.amount, r.currency)}{' '}
                            {r.forWorkers && <span className="kind-badge">{t('For workers')}</span>}{' '}
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
