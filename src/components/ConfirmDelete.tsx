import { useState } from 'react'
import { useT } from '../lib/i18n'

/**
 * Delete with a clear confirmation box: first press opens a warning that says exactly
 * what will be removed; only "Delete permanently" in that box deletes.
 */
export function ConfirmDelete({
  label,
  question,
  details,
  onDelete,
}: {
  label: string
  question: string
  details: string
  onDelete: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-small btn-danger-outline" onClick={() => setOpen(true)}>
        {label}
      </button>
    )
  }
  return (
    <div className="confirm-box" role="alertdialog" aria-label={question}>
      <p className="confirm-q">{question}</p>
      <p className="confirm-d">{details}</p>
      <p className="confirm-d">{t('This cannot be undone.')}</p>
      <div className="confirm-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(false)} autoFocus>
          {t('Cancel')}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-small"
          onClick={() => {
            onDelete()
            setOpen(false)
          }}
        >
          {t('Delete permanently')}
        </button>
      </div>
    </div>
  )
}
