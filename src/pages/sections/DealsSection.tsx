import { useState } from 'react'
import { addRecord, byDateDesc, groupByDate, removeRecord, updateRecord, useDB, type Deal, type SeasonCrop } from '../../lib/store'
import { formatNumber, todayISO } from '../../lib/format'
import { useCurrency } from '../../lib/money'
import { useT } from '../../lib/i18n'
import { dealBalances } from '../cropTotals'
import { DayHeading, DeleteButton, Empty, Field, FormCard, MoneyInput, RateMissing, SectionHead, Stamp, Stat, num, str } from '../../components/ui'

type Form = {
  date: string
  person: string
  direction: Deal['direction']
  kind: Deal['kind']
  item: string
  quantity: string
  unit: string
  amount: string
  currency: string
  note: string
}

/** Oldi-berdi: money or products given to or taken from other people, with who owes whom. */
export function DealsSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
  const list = db.deals.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const all = [...db.deals].sort(byDateDesc((r) => r.date))
  const people = [...new Set(all.map((r) => r.person).filter(Boolean))]
  const items = [...new Set(all.map((r) => r.item).filter(Boolean))]
  const units = [...new Set(['kg', 'quti', 'dona', 'l', ...all.map((r) => r.unit).filter(Boolean)])]
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)

  function open(rec?: Deal) {
    setError(null)
    setF(
      rec
        ? {
            date: rec.date,
            person: rec.person,
            direction: rec.direction,
            kind: rec.kind,
            item: rec.item,
            quantity: str(rec.quantity),
            unit: rec.unit,
            amount: str(rec.amount),
            currency: rec.currency,
            note: rec.note,
          }
        : {
            date: todayISO(),
            person: '',
            direction: 'gave',
            kind: 'money',
            item: '',
            quantity: '',
            unit: '',
            amount: '',
            currency: all[0]?.currency ?? cur.display,
            note: '',
          },
    )
    setEditing(rec ? rec.id : 'new')
  }

  function submit() {
    if (!f) return
    const amount = num(f.amount)
    const quantity = num(f.quantity)
    if (!f.date) return setError(t('Enter the date.'))
    if (!f.person.trim()) return setError(t('Enter who the deal is with.'))
    if (f.kind === 'money' && (amount === null || amount <= 0)) return setError(t('Enter the amount of money.'))
    if (f.kind === 'product' && !f.item.trim()) return setError(t('Enter the product.'))
    if (f.kind === 'product' && (quantity === null || quantity <= 0)) return setError(t('Enter the quantity.'))
    if ((amount ?? 0) < 0) return setError(t('Amounts cannot be negative.'))
    const product = f.kind === 'product'
    const data = {
      cropId: crop.id,
      date: f.date,
      person: f.person.trim(),
      direction: f.direction,
      kind: f.kind,
      item: product ? f.item.trim() : '',
      quantity: product ? quantity : null,
      unit: product ? f.unit.trim() : '',
      amount,
      currency: f.currency,
      note: f.note.trim(),
    }
    if (editing === 'new') addRecord('deals', data)
    else if (editing) updateRecord('deals', editing, data)
    setEditing(null)
  }

  const balances = dealBalances(list, cur.display, cur.rates)
  const given = balances.reduce((a, p) => a + p.given, 0)
  const got = balances.reduce((a, p) => a + p.got, 0)
  const owedToUs = balances.reduce((a, p) => a + Math.max(0, p.balance), 0)
  const weOwe = balances.reduce((a, p) => a + Math.max(0, -p.balance), 0)

  const what = (r: Deal) =>
    r.kind === 'money'
      ? cur.both(r.amount, r.currency)
      : `${r.item} · ${formatNumber(r.quantity)} ${r.unit}`.trim() + (r.amount ? ` (${t('value')} ${cur.both(r.amount, r.currency)})` : '')

  return (
    <>
      <div className="stat-grid">
        <Stat label={t('We gave')} value={cur.fmt(given)} />
        <Stat label={t('We got')} value={cur.fmt(got)} />
        <Stat label={t('They owe us')} value={cur.fmt(owedToUs)} tone={owedToUs > 0 ? 'good' : undefined} />
        <Stat label={t('We owe')} value={cur.fmt(weOwe)} tone={weOwe > 0 ? 'warn' : undefined} />
      </div>
      <RateMissing show={balances.some((p) => p.missing)} />

      <SectionHead
        title=""
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + {t('Add give & take')}
            </button>
          )
        }
      />

      {editing && f && (
        <FormCard
          title={editing === 'new' ? t('Add give & take') : t('Edit give & take')}
          submitLabel={editing === 'new' ? t('Save') : t('Save changes')}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <div className="field">
            <span className="field-label" id="deal-dir-label">
              {t('Direction')}
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="deal-dir-label">
              {(['gave', 'got'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={f.direction === d}
                  className={f.direction === d ? `is-on ${d === 'gave' ? 'is-gave' : 'is-got'}` : ''}
                  onClick={() => setF({ ...f, direction: d })}
                >
                  {d === 'gave' ? `↗ ${t('We gave')}` : `↙ ${t('We got')}`}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label" id="deal-kind-label">
              {t('What')}
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="deal-kind-label">
              {(['money', 'product'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={f.kind === k}
                  className={f.kind === k ? 'is-on is-good' : ''}
                  onClick={() => setF({ ...f, kind: k })}
                >
                  {k === 'money' ? t('Money') : t('Product')}
                </button>
              ))}
            </div>
          </div>
          <Field label={t('Date')}>
            <input id="deal-date" className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label={t('Person')}>
            <input
              id="deal-person"
              className="input"
              list="deal-people"
              value={f.person}
              onChange={(e) => setF({ ...f, person: e.target.value })}
              placeholder={t('Name')}
            />
            <datalist id="deal-people">
              {people.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          {f.kind === 'product' && (
            <>
              <Field label={t('Product')}>
                <input
                  id="deal-item"
                  className="input"
                  list="deal-items"
                  value={f.item}
                  onChange={(e) => setF({ ...f, item: e.target.value })}
                  placeholder={t('e.g. boxes, fertilizer, tomatoes')}
                />
                <datalist id="deal-items">
                  {items.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
              <Field label={t('Quantity')}>
                <div className="qty-input">
                  <input
                    id="deal-qty"
                    className="input"
                    inputMode="decimal"
                    value={f.quantity}
                    onChange={(e) => setF({ ...f, quantity: e.target.value })}
                  />
                  <input
                    id="deal-unit"
                    className="input"
                    list="deal-units"
                    placeholder={t('unit')}
                    aria-label={t('unit')}
                    value={f.unit}
                    onChange={(e) => setF({ ...f, unit: e.target.value })}
                  />
                  <datalist id="deal-units">
                    {units.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              </Field>
            </>
          )}
          <Field
            label={f.kind === 'money' ? t('Amount') : t('Value (optional)')}
            hint={f.kind === 'product' ? t('How much the product is worth. Counted in the balance.') : undefined}
          >
            <MoneyInput
              id="deal-amount"
              value={f.amount}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, amount: v })}
            />
          </Field>
          <Field label={t('Note (optional)')} wide>
            <input id="deal-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {balances.length > 0 && (
        <>
          <SectionHead title={t('By person')} />
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Person')}</th>
                  <th className="num">{t('We gave')}</th>
                  <th className="num">{t('We got')}</th>
                  <th className="num">{t('Balance')}</th>
                  <th>{t('Products')}</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((p) => (
                  <tr key={p.person}>
                    <td>
                      <b>{p.person}</b>
                    </td>
                    <td className="num">{cur.fmt(p.given)}</td>
                    <td className="num">{cur.fmt(p.got)}</td>
                    <td className="num">
                      {Math.abs(p.balance) < 0.005 ? (
                        <span className="pay-badge paid">{t('Even')}</span>
                      ) : p.balance > 0 ? (
                        <span className="text-income">{t('Owes us {amount}', { amount: cur.fmt(p.balance) })}</span>
                      ) : (
                        <span className="text-owed">{t('We owe {amount}', { amount: cur.fmt(-p.balance) })}</span>
                      )}
                    </td>
                    <td>
                      {p.products.length === 0
                        ? '—'
                        : p.products.map((x) => (
                            <div key={`${x.item}|${x.unit}`} className={x.net > 0 ? 'text-income' : 'text-owed'}>
                              {x.net > 0
                                ? t('{item}: owes us {qty}', { item: x.item, qty: `${formatNumber(x.net)} ${x.unit}`.trim() })
                                : t('{item}: we owe {qty}', { item: x.item, qty: `${formatNumber(-x.net)} ${x.unit}`.trim() })}
                            </div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">{t('Balance = what we gave − what we got. Products count by their value if one was entered.')}</p>
        </>
      )}

      {list.length === 0 ? (
        !editing && (
          <Empty title={t('No give & take recorded yet')}>
            {t('Record money or products you gave to or got from other people. The balance with each person is kept for you.')}
          </Empty>
        )
      ) : (
        <>
          <SectionHead title={t('All entries')} />
          <div className="day-groups">
            {groupByDate(list, (r) => r.date).map(([date, rows]) => (
              <section key={date} className="day-group">
                <DayHeading date={date} />
                <ul className="records">
                  {rows.map((r) => (
                    <li key={r.id} className={`card record record-${r.direction}`}>
                      <div className="record-main">
                        <span className="record-title">
                          <span className={`deal-badge ${r.direction}`}>{r.direction === 'gave' ? `↗ ${t('We gave')}` : `↙ ${t('We got')}`}</span>{' '}
                          {r.person} · {what(r)}
                        </span>
                        {r.note && <span className="record-sub">{r.note}</span>}
                        <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
                      </div>
                      <div className="record-actions">
                        <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                          {t('Edit')}
                        </button>
                        <DeleteButton onDelete={() => removeRecord('deals', r.id)} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}
