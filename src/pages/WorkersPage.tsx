import { useState } from 'react'
import {
  addRecord,
  attendanceKey,
  removeRecord,
  seasonLabel,
  setAttendance,
  updateRecord,
  useDB,
  type Season,
  type Worker,
} from '../lib/store'
import { formatDate, formatDateTime, formatNumber, todayISO, useMoney } from '../lib/format'
import { Breadcrumbs, DeleteButton, Empty, Field, FormCard, PageHead, SectionHead, Stat, num, str } from '../components/ui'

function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function WorkersPage({ season }: { season: Season }) {
  const db = useDB()
  const money = useMoney()
  const workers = db.workers.filter((w) => w.seasonId === season.id).sort((a, b) => a.name.localeCompare(b.name))
  const workerIds = new Set(workers.map((w) => w.id))
  const records = Object.values(db.attendance).filter((a) => workerIds.has(a.workerId))

  const [date, setDate] = useState(todayISO())
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState({ name: '', phone: '', dailySalary: '' })
  const [error, setError] = useState<string | null>(null)
  const currentMonth = todayISO().slice(0, 7)
  const [period, setPeriod] = useState<string>(currentMonth)

  function open(w?: Worker) {
    setError(null)
    setF(w ? { name: w.name, phone: w.phone, dailySalary: str(w.dailySalary) } : { name: '', phone: '', dailySalary: str(workers.at(-1)?.dailySalary) })
    setEditing(w ? w.id : 'new')
  }

  function submit() {
    const salary = num(f.dailySalary)
    if (!f.name.trim()) return setError("Enter the worker's name.")
    if (salary === null || salary < 0) return setError('Enter the daily salary.')
    const data = { seasonId: season.id, name: f.name.trim(), phone: f.phone.trim(), dailySalary: salary }
    if (editing === 'new') addRecord('workers', data)
    else if (editing) updateRecord('workers', editing, data)
    setEditing(null)
  }

  // ----- summary for the chosen period -----
  const months = [...new Set([currentMonth, ...records.map((r) => r.date.slice(0, 7))])].sort().reverse()
  const inPeriod = records.filter((r) => period === 'all' || r.date.startsWith(period))
  const summary = workers.map((w) => {
    const mine = inPeriod.filter((r) => r.workerId === w.id)
    const on = mine.filter((r) => r.status === 'on')
    return {
      worker: w,
      daysOn: on.length,
      daysOff: mine.length - on.length,
      earned: on.reduce((a, r) => a + r.salary, 0),
    }
  })
  const totalEarned = summary.reduce((a, s) => a + s.earned, 0)
  const markedToday = workers.filter((w) => db.attendance[attendanceKey(w.id, date)]).length
  const onToday = workers.filter((w) => db.attendance[attendanceKey(w.id, date)]?.status === 'on').length

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Seasons', to: [] },
          { label: seasonLabel(season), to: ['season', season.id] },
          { label: 'Workers' },
        ]}
      />
      <PageHead title="Workers" sub={`${seasonLabel(season)} season · days on and off, and daily salary`} />

      {/* ---------- daily attendance ---------- */}
      <SectionHead title="Mark the day" />
      {workers.length === 0 ? (
        <Empty title="No workers yet">Add your workers below, then mark who worked each day.</Empty>
      ) : (
        <div className="card attendance">
          <div className="date-nav">
            <button className="btn btn-ghost btn-icon" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>
              ‹
            </button>
            <input className="input date-input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button className="btn btn-ghost btn-icon" aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))}>
              ›
            </button>
            {date !== todayISO() && (
              <button className="btn btn-ghost btn-small" onClick={() => setDate(todayISO())}>
                Today
              </button>
            )}
          </div>
          <p className="field-hint">
            {formatDate(date)}: {onToday} working, {markedToday - onToday} day off, {workers.length - markedToday} not marked
          </p>
          <ul className="att-list">
            {workers.map((w) => {
              const a = db.attendance[attendanceKey(w.id, date)]
              return (
                <li key={w.id} className="att-row">
                  <span className="att-name">
                    {w.name}
                    <span className="stamp">{a ? `Marked ${formatDateTime(a.updatedAt)}` : `${money(w.dailySalary)} / day`}</span>
                  </span>
                  <div className="segmented" role="radiogroup" aria-label={`${w.name} on ${formatDate(date)}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={a?.status === 'on'}
                      className={a?.status === 'on' ? 'is-on is-good' : ''}
                      onClick={() => setAttendance(w, date, a?.status === 'on' ? null : 'on')}
                    >
                      Worked
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={a?.status === 'off'}
                      className={a?.status === 'off' ? 'is-on is-off' : ''}
                      onClick={() => setAttendance(w, date, a?.status === 'off' ? null : 'off')}
                    >
                      Day off
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ---------- salary summary ---------- */}
      {workers.length > 0 && (
        <>
          <SectionHead
            title="Salary summary"
            action={
              <select className="input input-compact" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
                <option value="all">Whole season</option>
              </select>
            }
          />
          <div className="stat-grid">
            <Stat label="Salaries to pay" value={money(totalEarned)} />
            <Stat label="Working days" value={formatNumber(summary.reduce((a, s) => a + s.daysOn, 0), 0)} />
            <Stat label="Days off" value={formatNumber(summary.reduce((a, s) => a + s.daysOff, 0), 0)} />
          </div>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th className="num">Days on</th>
                  <th className="num">Days off</th>
                  <th className="num">Salary</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.worker.id}>
                    <td>{s.worker.name}</td>
                    <td className="num">{s.daysOn}</td>
                    <td className="num">{s.daysOff}</td>
                    <td className="num">{money(s.earned)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{summary.reduce((a, s) => a + s.daysOn, 0)}</td>
                  <td className="num">{summary.reduce((a, s) => a + s.daysOff, 0)}</td>
                  <td className="num">{money(totalEarned)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="field-hint">Salary = days worked × the daily salary on that day.</p>
        </>
      )}

      {/* ---------- worker list ---------- */}
      <SectionHead
        title="Worker list"
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + Add worker
            </button>
          )
        }
      />
      {editing && (
        <FormCard
          title={editing === 'new' ? 'Add worker' : 'Edit worker'}
          submitLabel={editing === 'new' ? 'Save' : 'Save changes'}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label="Name">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Phone (optional)">
            <input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Daily salary" hint={editing !== 'new' ? 'A new salary applies to days marked from now on' : undefined}>
            <input className="input" inputMode="decimal" value={f.dailySalary} onChange={(e) => setF({ ...f, dailySalary: e.target.value })} />
          </Field>
        </FormCard>
      )}
      {workers.length > 0 && (
        <ul className="records">
          {workers.map((w) => (
            <li key={w.id} className="card record">
              <div className="record-main">
                <span className="record-title">{w.name}</span>
                <span className="record-sub">
                  {money(w.dailySalary)} per day
                  {w.phone && (
                    <>
                      {' · '}
                      <a href={`tel:${w.phone.replace(/[^\d+]/g, '')}`}>{w.phone}</a>
                    </>
                  )}
                </span>
                <span className="stamp">Added {formatDateTime(w.createdAt)}</span>
              </div>
              <div className="record-actions">
                <button className="btn btn-ghost btn-small" onClick={() => open(w)}>
                  Edit
                </button>
                <DeleteButton onDelete={() => removeRecord('workers', w.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
