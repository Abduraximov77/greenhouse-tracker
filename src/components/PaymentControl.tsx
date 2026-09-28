import { useState } from 'react'
import { payment, type PayStatus } from '../lib/store'
import { useCurrency } from '../lib/money'
import { useT } from '../lib/i18n'
import { num, str } from './ui'

/** Not paid / Partly / Paid, with the amount paid when partly paid. */
export function PaymentControl({
  id,
  due,
  currency,
  status,
  paidAmount,
  onChange,
  compact,
}: {
  id: string
  due: number
  currency: string
  status: PayStatus
  paidAmount: number | null
  onChange: (status: PayStatus, paidAmount: number | null) => void
  compact?: boolean
}) {
  const t = useT()
  const cur = useCurrency()
  const [amount, setAmount] = useState(str(paidAmount))
  const { owed } = payment(due, status, paidAmount)
  const options: { v: PayStatus; label: string; cls: string }[] = [
    { v: 'unpaid', label: t('Not paid'), cls: 'is-off' },
    { v: 'partial', label: t('Partly'), cls: 'is-part' },
    { v: 'paid', label: t('Paid'), cls: 'is-good' },
  ]
  return (
    <div className={`pay-control${compact ? ' pay-compact' : ''}`}>
      <div className="segmented" role="radiogroup" aria-label={t('Payment')}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={status === o.v}
            className={status === o.v ? `is-on ${o.cls}` : ''}
            onClick={() => onChange(o.v, o.v === 'partial' ? num(amount) : null)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {status === 'partial' && (
        <label className="pay-partial" htmlFor={`${id}-paid`}>
          <span>{t('Amount paid')}</span>
          <span className="money-input">
            <input
              id={`${id}-paid`}
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                const n = num(e.target.value)
                if (e.target.value.trim() === '' || (n !== null && n >= 0)) onChange('partial', n)
              }}
            />
            <span className="money-cur money-cur-static">{currency}</span>
          </span>
        </label>
      )}
      {status !== 'paid' && due > 0 && (
        <span className="pay-owed">{t('Still to pay: {amount}', { amount: cur.fmt(owed, currency) })}</span>
      )}
    </div>
  )
}
