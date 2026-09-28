import { useState } from 'react'
import { useT } from '../lib/i18n'
import { useCurrency } from '../lib/money'
import { num } from './ui'

/**
 * "Partly paid" button that opens an amount field. The amount is applied by the caller
 * (oldest unpaid days first). `owed` is shown so the user knows the maximum.
 */
export function PartialPay({
  id,
  owed,
  currency,
  onApply,
  small,
}: {
  id: string
  owed: number
  currency: string
  onApply: (amount: number) => void
  small?: boolean
}) {
  const t = useT()
  const cur = useCurrency()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" className={`btn btn-ghost ${small ? 'btn-small' : 'btn-small'} btn-part`} onClick={() => setOpen(true)}>
        {t('Partly')}…
      </button>
    )
  }
  const n = num(value)
  return (
    <form
      className="partial-pay"
      onSubmit={(e) => {
        e.preventDefault()
        if (n === null || n <= 0) return setError(t('Enter the amount paid.'))
        if (n > owed + 0.005) return setError(t('That is more than is owed ({amount}).', { amount: cur.fmt(owed, currency) }))
        onApply(n)
        setOpen(false)
        setValue('')
        setError(null)
      }}
    >
      <span className="money-input">
        <input
          id={id}
          className="input"
          inputMode="decimal"
          placeholder={t('Amount paid')}
          aria-label={t('Amount paid')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <span className="money-cur money-cur-static">{currency}</span>
      </span>
      <button type="submit" className="btn btn-primary btn-small">
        {t('Save')}
      </button>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(false)}>
        {t('Cancel')}
      </button>
      {error && <span className="partial-error">{error}</span>}
    </form>
  )
}
