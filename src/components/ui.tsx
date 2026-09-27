import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatDateTime } from '../lib/format'
import { href } from '../lib/router'

/** Parse what the user typed ("12,5", " 3 ") into a number, or null if empty/invalid. */
export function num(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Number → string for putting back into an input. */
export function str(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? '' : String(n)
}

export function Field({
  label,
  hint,
  children,
  wide,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
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
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="crumb">
          {it.to ? <a href={href(...it.to)}>{it.label}</a> : <span aria-current="page">{it.label}</span>}
          {i < items.length - 1 && <span className="crumb-sep" aria-hidden="true">/</span>}
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

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
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
export function Stamp({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  const edited = updatedAt !== createdAt
  return (
    <span className="stamp" title={edited ? `Edited ${formatDateTime(updatedAt)}` : undefined}>
      Saved {formatDateTime(createdAt)}
      {edited && ' · edited'}
    </span>
  )
}

/** Two-step delete: first tap asks, second tap deletes. Resets after a few seconds. */
export function DeleteButton({ onDelete, label = 'Delete' }: { onDelete: () => void; label?: string }) {
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
      {armed ? 'Tap again to delete' : label}
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
          Cancel
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
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  )
}
