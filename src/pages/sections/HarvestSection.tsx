import { useState } from 'react'
import { addRecord, byDateDesc, removeRecord, updateRecord, useDB, type Harvest, type SeasonCrop } from '../../lib/store'
import { formatDate, formatNumber, round, todayISO } from '../../lib/format'
import { Computed, DeleteButton, Empty, Field, FormCard, SectionHead, Stamp, Stat, num, str } from '../../components/ui'

type Form = { date: string; boxes: string; kgPerBox: string; note: string }

export function HarvestSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const list = db.harvests.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form>({ date: todayISO(), boxes: '', kgPerBox: '', note: '' })
  const [error, setError] = useState<string | null>(null)

  function open(rec?: Harvest) {
    setError(null)
    if (!rec) {
      // Box weight is usually the same every day: reuse the last one.
      setF({ date: todayISO(), boxes: '', kgPerBox: str(list[0]?.kgPerBox), note: '' })
      setEditing('new')
    } else {
      setF({ date: rec.date, boxes: str(rec.boxes), kgPerBox: str(rec.kgPerBox), note: rec.note })
      setEditing(rec.id)
    }
  }

  const boxes = num(f.boxes)
  const kgPerBox = num(f.kgPerBox)
  const totalKg = boxes !== null && kgPerBox !== null ? round(boxes * kgPerBox, 2) : null

  function submit() {
    if (!f.date) return setError('Enter the date.')
    if (boxes === null || boxes <= 0 || !Number.isInteger(boxes)) return setError('Enter the number of boxes (a whole number).')
    const data = { cropId: crop.id, date: f.date, boxes, kgPerBox, totalKg, note: f.note.trim() }
    if (editing === 'new') addRecord('harvests', data)
    else if (editing) updateRecord('harvests', editing, data)
    setEditing(null)
  }

  // Group entries by day, so several entries on one day show a daily total.
  const days = new Map<string, Harvest[]>()
  for (const r of list) days.set(r.date, [...(days.get(r.date) ?? []), r])

  const totalBoxes = list.reduce((a, r) => a + r.boxes, 0)
  const totalKgAll = list.reduce((a, r) => a + (r.totalKg ?? 0), 0)
  const today = days.get(todayISO())?.reduce((a, r) => a + r.boxes, 0) ?? 0

  return (
    <>
      <div className="stat-grid">
        <Stat label="Boxes today" value={formatNumber(today, 0)} />
        <Stat label="Boxes this season" value={formatNumber(totalBoxes, 0)} />
        <Stat label="Weight this season" value={totalKgAll ? `${formatNumber(totalKgAll, 0)} kg` : '—'} />
        <Stat label="Harvest days" value={formatNumber(days.size, 0)} />
      </div>

      <SectionHead
        title="Packed boxes ready for export"
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + Add harvest
            </button>
          )
        }
      />

      {editing && (
        <FormCard
          title={editing === 'new' ? 'Add harvest' : 'Edit harvest'}
          submitLabel={editing === 'new' ? 'Save' : 'Save changes'}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label="Date">
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Boxes packed">
            <input className="input" inputMode="numeric" value={f.boxes} onChange={(e) => setF({ ...f, boxes: e.target.value })} />
          </Field>
          <Field label="Kg per box (optional)" hint="Remembered for next time">
            <input className="input" inputMode="decimal" value={f.kgPerBox} onChange={(e) => setF({ ...f, kgPerBox: e.target.value })} />
          </Field>
          <Computed
            label="Total weight"
            value={totalKg !== null ? `${formatNumber(totalKg)} kg` : '—'}
            note={totalKg !== null ? `${formatNumber(boxes, 0)} boxes × ${formatNumber(kgPerBox)} kg` : 'Boxes × kg per box'}
          />
          <Field label="Note (optional)" wide>
            <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {list.length === 0 ? (
        !editing && <Empty title="No harvest recorded yet">Add how many boxes were packed each day.</Empty>
      ) : (
        <div className="day-groups">
          {[...days.entries()].map(([date, rows]) => {
            const dayBoxes = rows.reduce((a, r) => a + r.boxes, 0)
            return (
              <section key={date} className="day-group">
                <h3 className="day-head">
                  <span>{formatDate(date)}</span>
                  <span>{formatNumber(dayBoxes, 0)} boxes</span>
                </h3>
                <ul className="records">
                  {rows.map((r) => (
                    <li key={r.id} className="card record">
                      <div className="record-main">
                        <span className="record-title">{formatNumber(r.boxes, 0)} boxes</span>
                        <span className="record-sub">
                          {r.totalKg !== null ? `${formatNumber(r.totalKg)} kg (${formatNumber(r.kgPerBox)} kg/box)` : 'No weight entered'}
                          {r.note ? ` · ${r.note}` : ''}
                        </span>
                        <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
                      </div>
                      <div className="record-actions">
                        <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                          Edit
                        </button>
                        <DeleteButton onDelete={() => removeRecord('harvests', r.id)} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
