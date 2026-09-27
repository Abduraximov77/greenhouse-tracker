import { useState } from 'react'
import {
  addRecord,
  byDateDesc,
  cropDays,
  groupByDate,
  removeRecord,
  updateRecord,
  useDB,
  type Harvest,
  type Season,
  type SeasonCrop,
} from '../../lib/store'
import { formatNumber, round, todayISO } from '../../lib/format'
import { href } from '../../lib/router'
import { useT } from '../../lib/i18n'
import { Computed, DayHeading, DeleteButton, Empty, Field, FormCard, SectionHead, Stamp, Stat, num, str } from '../../components/ui'

type Form = { date: string; boxes: string; kgPerBox: string; note: string }

/** One line in a harvest day: either a worker's boxes or an extra entry. */
type Line = { kind: 'worker'; workerName: string; boxes: number } | { kind: 'entry'; rec: Harvest }

export function HarvestSection({ season, crop }: { season: Season; crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const entries = db.harvests.filter((r) => r.cropId === crop.id).sort(byDateDesc((r) => r.date))
  const workerDays = cropDays(db, crop.id).filter((d) => d.status === 'on' && (d.boxes ?? 0) > 0)
  const nameOf = (id: string) => db.workers.find((w) => w.id === id)?.name ?? '—'

  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState<Form>({ date: todayISO(), boxes: '', kgPerBox: '', note: '' })
  const [error, setError] = useState<string | null>(null)

  function open(rec?: Harvest) {
    setError(null)
    if (!rec) {
      // Box weight is usually the same every day: reuse the last one.
      setF({ date: todayISO(), boxes: '', kgPerBox: str(entries[0]?.kgPerBox), note: '' })
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
    if (!f.date) return setError(t('Enter the date.'))
    if (boxes === null || boxes <= 0 || !Number.isInteger(boxes)) return setError(t('Enter the number of boxes (a whole number).'))
    const data = { cropId: crop.id, date: f.date, boxes, kgPerBox, totalKg, note: f.note.trim() }
    if (editing === 'new') addRecord('harvests', data)
    else if (editing) updateRecord('harvests', editing, data)
    setEditing(null)
  }

  // Merge worker boxes and extra entries into one list per day.
  const lines: { date: string; line: Line }[] = [
    ...workerDays
      .sort((a, b) => nameOf(a.workerId).localeCompare(nameOf(b.workerId)))
      .map((d) => ({ date: d.date, line: { kind: 'worker', workerName: nameOf(d.workerId), boxes: d.boxes ?? 0 } as Line })),
    ...entries.map((r) => ({ date: r.date, line: { kind: 'entry', rec: r } as Line })),
  ]
  const days = groupByDate(lines, (l) => l.date)
  const boxesOf = (l: Line) => (l.kind === 'worker' ? l.boxes : l.rec.boxes)

  const totalBoxes = lines.reduce((a, l) => a + boxesOf(l.line), 0)
  const totalKgAll = entries.reduce((a, r) => a + (r.totalKg ?? 0), 0)
  const today = days.find(([d]) => d === todayISO())?.[1].reduce((a, l) => a + boxesOf(l.line), 0) ?? 0

  return (
    <>
      <div className="stat-grid">
        <Stat label={t('Boxes today')} value={formatNumber(today, 0)} />
        <Stat label={t('Boxes this season')} value={formatNumber(totalBoxes, 0)} />
        <Stat label={t('Weight recorded')} value={totalKgAll ? `${formatNumber(totalKgAll, 0)} ${t('kg')}` : '—'} />
        <Stat label={t('Harvest days')} value={formatNumber(days.length, 0)} />
      </div>

      <SectionHead
        title={t('Packed boxes ready for export')}
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + {t('Add other boxes')}
            </button>
          )
        }
      />
      <p className="field-hint">
        {t("Boxes from the Workers tab are counted here automatically. Use “Add other boxes” only for boxes that aren't entered under a worker, so nothing is counted twice.")}
      </p>

      {editing && (
        <FormCard
          title={editing === 'new' ? t('Add other boxes') : t('Edit boxes')}
          submitLabel={editing === 'new' ? t('Save') : t('Save changes')}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label={t('Date')}>
            <input id="harvest-date" className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label={t('Boxes packed')}>
            <input id="harvest-boxes" className="input" inputMode="numeric" value={f.boxes} onChange={(e) => setF({ ...f, boxes: e.target.value })} />
          </Field>
          <Field label={t('Kg per box (optional)')} hint={t('Remembered for next time')}>
            <input id="harvest-kg" className="input" inputMode="decimal" value={f.kgPerBox} onChange={(e) => setF({ ...f, kgPerBox: e.target.value })} />
          </Field>
          <Computed
            label={t('Total weight')}
            value={totalKg !== null ? `${formatNumber(totalKg)} ${t('kg')}` : '—'}
            note={
              totalKg !== null
                ? `${formatNumber(boxes, 0)} × ${formatNumber(kgPerBox)} ${t('kg')}`
                : t('Boxes × kg per box')
            }
          />
          <Field label={t('Note (optional)')} wide>
            <input id="harvest-note" className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </FormCard>
      )}

      {days.length === 0 ? (
        !editing && (
          <Empty title={t('No harvest recorded yet')}>
            {t('Enter boxes for each worker in the Workers tab, and they will appear here by day.')}
          </Empty>
        )
      ) : (
        <div className="day-groups">
          {days.map(([date, dayLines]) => {
            const dayTotal = dayLines.reduce((a, l) => a + boxesOf(l.line), 0)
            const workerLines = dayLines.filter((l) => l.line.kind === 'worker').map((l) => l.line) as Extract<Line, { kind: 'worker' }>[]
            const entryLines = dayLines.filter((l) => l.line.kind === 'entry').map((l) => l.line) as Extract<Line, { kind: 'entry' }>[]
            return (
              <section key={date} className="day-group">
                <DayHeading date={date} right={t('{n} boxes', { n: formatNumber(dayTotal, 0) })} />
                <ul className="records">
                  {workerLines.length > 0 && (
                    <li className="card record">
                      <div className="record-main">
                        <span className="record-title">
                          {t('From workers')}: {formatNumber(workerLines.reduce((a, l) => a + l.boxes, 0), 0)}
                        </span>
                        <ul className="worker-boxes">
                          {workerLines.map((l, i) => (
                            <li key={i}>
                              <span>{l.workerName}</span>
                              <b>{formatNumber(l.boxes, 0)}</b>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="record-actions">
                        <a className="btn btn-ghost btn-small" href={href('season', season.id, 'crop', crop.id, 'workers')}>
                          {t('Open Workers')}
                        </a>
                      </div>
                    </li>
                  )}
                  {entryLines.map(({ rec: r }) => (
                    <li key={r.id} className="card record">
                      <div className="record-main">
                        <span className="record-title">
                          {t('Other boxes')}: {formatNumber(r.boxes, 0)}
                        </span>
                        <span className="record-sub">
                          {r.totalKg !== null
                            ? `${formatNumber(r.totalKg)} ${t('kg')} (${formatNumber(r.kgPerBox)} ${t('kg per box')})`
                            : t('No weight entered')}
                          {r.note ? ` · ${r.note}` : ''}
                        </span>
                        <Stamp createdAt={r.createdAt} updatedAt={r.updatedAt} />
                      </div>
                      <div className="record-actions">
                        <button className="btn btn-ghost btn-small" onClick={() => open(r)}>
                          {t('Edit')}
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
