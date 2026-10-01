import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatDateTime, formatDayLong } from '../lib/format'
import { useT } from '../lib/i18n'
import { useDB } from '../lib/store'
import { href } from '../lib/router'

/**
 * Parse what the user typed into a number, or null if empty/invalid.
 *   "12,5" → 12.5   "12.5" → 12.5   "12 600" → 12600   "12,600" → 12600   "1,500,000" → 1500000
 *   "1.500.000" → 1500000   "1,234.5" → 1234.5   "1.234,5" → 1234.5
 * A single comma followed by exactly three digits is a thousands sign when there is no other separator
 * and the number does not start with 0 ("0,125" stays 0.125); a single dot is always decimal ("12.600" →
 * 12.6). Anything else is refused.
 */
export function num(s: string): number | null {
  let t = s.trim().replace(/[\s\u00a0\u202f']/g, '')
  if (t === '') return null
  if (!/^[-+]?[\d.,]+$/.test(t) || !/\d/.test(t)) return null
  const commas = (t.match(/,/g) ?? []).length
  const dots = (t.match(/\./g) ?? []).length
  if (commas && dots) {
    // the last separator is the decimal one, the other is for thousands
    const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.'
    const thou = dec === ',' ? '.' : ','
    if ((t.match(new RegExp('\\' + dec, 'g')) ?? []).length > 1) return null
    t = t.split(thou).join('').replace(dec, '.')
  } else if (commas + dots > 1) {
    // "1,500,000" / "1.500.000": thousands only, every group of three
    const sep = commas ? ',' : '.'
    const parts = t.replace(/^[-+]/, '').split(sep)
    if (parts.slice(1).some((p) => p.length !== 3) || !parts[0]) return null
    t = t.split(sep).join('')
  } else if (commas + dots === 1) {
    const sep = commas ? ',' : '.'
    const [a, b] = t.replace(/^[-+]/, '').split(sep)
    const thousands = b.length === 3 && /^[1-9]\d{0,2}$/.test(a) && sep === ','
    t = thousands ? t.replace(sep, '') : t.replace(sep, '.')
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Number → string for putting back into an input. */
export function str(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? '' : String(n)
}

export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

/** A result that the app calculates for the user. */
export function Computed({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="computed field-wide">
      <span className="computed-label">{label}</span>
      <span className="computed-value">{value}</span>
      {note && <span className="computed-note">{note}</span>}
    </div>
  )
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string[] }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumbs">
      {items.map((it, i) => (
        <span key={i} className="crumb">
          {it.to ? <a href={href(...it.to)}>{it.label}</a> : <span aria-current="page">{it.label}</span>}
          {i < items.length - 1 && (
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, tone, note }: { label: string; value: ReactNode; tone?: 'good' | 'warn'; note?: ReactNode }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
    </div>
  )
}

/** Shows when a record was saved (automatic). */
export function Stamp({ createdAt, updatedAt, by }: { createdAt: string; updatedAt: string; by?: string | null }) {
  const t = useT()
  const edited = updatedAt !== createdAt
  return (
    <span className="stamp" title={edited ? t('Edited {time}', { time: formatDateTime(updatedAt) }) : undefined}>
      {t('Saved {time}', { time: formatDateTime(createdAt) })}
      {edited && ` · ${t('edited')}`}
      {by && ` · ${by}`}
    </span>
  )
}

/** Bold date heading that separates records day by day. */
export function DayHeading({ date, right }: { date: string; right?: ReactNode }) {
  return (
    <h3 className="day-head">
      <span>{formatDayLong(date)}</span>
      {right && <span className="day-head-right">{right}</span>}
    </h3>
  )
}

/** Two-step delete: first tap asks, second tap deletes. Resets after a few seconds. */
export function DeleteButton({ onDelete, label }: { onDelete: () => void; label?: string }) {
  const t = useT()
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={`btn btn-small ${armed ? 'btn-danger' : 'btn-ghost'}`}
      onClick={() => (armed ? onDelete() : setArmed(true))}
    >
      {armed ? t('Tap again to delete') : (label ?? t('Delete'))}
    </button>
  )
}

/** Card that holds an add/edit form. Scrolls itself into view when opened. */
export function FormCard({
  title,
  onCancel,
  onSubmit,
  submitLabel,
  children,
  error,
}: {
  title: string
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  children: ReactNode
  error?: string | null
}) {
  const t = useT()
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    ref.current?.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true })
  }, [])
  return (
    <form
      ref={ref}
      className="card form-card"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <h2 className="card-title">{title}</h2>
      <div className="form-grid">{children}</div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className={`section-head${title ? '' : ' section-head-bare'}`}>
      {title && <h2 className="section-title">{title}</h2>}
      {action}
    </div>
  )
}

/** Number field with its own currency switch (e.g. 4 500 | USD). */
export function MoneyInput({
  id,
  value,
  onChange,
  currency,
  onCurrency,
  className,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  currency: string
  onCurrency: (c: string) => void
  className?: string
}) {
  const t = useT()
  const display = useDB().settings.currency
  const options = [...new Set([currency, display, 'USD', 'UZS', 'RUB'])]
  return (
    <div className={`money-input${className ? ` ${className}` : ''}`}>
      <input id={id} className="input" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      <select className="money-cur" aria-label={t('Currency')} value={currency} onChange={(e) => onCurrency(e.target.value)}>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Small warning shown when a total can't include some amounts because a rate is missing. */
export function RateMissing({ show }: { show: boolean }) {
  const t = useT()
  if (!show) return null
  return (
    <p className="field-hint text-warn">
      {t('Some amounts are in another currency and no exchange rate is set.')} <a href="#/settings">{t('Set the exchange rate')}</a>
    </p>
  )
}
