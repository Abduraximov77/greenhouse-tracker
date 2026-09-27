import { useState } from 'react'
import {
  addRecord,
  attendanceKey,
  dayPay,
  removeRecord,
  seasonLabel,
  setWorkerDay,
  updateRecord,
  useDB,
  type Attendance,
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
  // Workers are shared by every season.
  const workers = [...db.workers].sort((a, b) => a.name.localeCompare(b.name))
  const days = Object.values(db.attendance).filter((a) => a.seasonId === season.id)

  const [date, setDate] = useState(todayISO())
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState({ name: '', phone: '', dailySalary: '', payPerBox: '' })
  const [error, setError] = useState<string | null>(null)
  const currentMonth = todayISO().slice(0, 7)
  const [period, setPeriod] = useState<string>(currentMonth)

  function open(w?: Worker) {
    setError(null)
    const last = workers.at(-1)
    setF(
      w
        ? { name: w.name, phone: w.phone, dailySalary: str(w.dailySalary), payPerBox: str(w.payPerBox) }
        : { name: '', phone: '', dailySalary: str(last?.dailySalary), payPerBox: str(last?.payPerBox) },
    )
    setEditing(w ? w.id : 'new')
  }

  function submit() {
    const salary = num(f.dailySalary) ?? 0
    const perBox = num(f.payPerBox) ?? 0
    if (!f.name.trim()) return setError("Enter the worker's name.")
    if (salary < 0 || perBox < 0) return setError('Amounts cannot be negative.')
    const data = { name: f.name.trim(), phone: f.phone.trim(), dailySalary: salary, payPerBox: perBox }
    if (editing === 'new') addRecord('workers', data)
    else if (editing) updateRecord('workers', editing, data)
    setEditing(null)
  }

  // ----- the chosen day -----
  const dayOf = (w: Worker) => db.attendance[attendanceKey(season.id, w.id, date)]
  const todays = workers.map(dayOf).filter(Boolean) as Attendance[]
  const onCount = todays.filter((a) => a.status === 'on').length
  const dayBoxes = todays.reduce((a, d) => a + (d.boxes ?? 0), 0)
  const dayTotal = todays.reduce((a, d) => a + dayPay(d), 0)
  const seasonCropIds = new Set(db.crops.filter((c) => c.seasonId === season.id).map((c) => c.id))
  const harvestBoxes = db.harvests
    .filter((h) => h.date === date && seasonCropIds.has(h.cropId))
    .reduce((a, h) => a + h.boxes, 0)

  // ----- summary for the chosen period -----
  const months = [...new Set([currentMonth, ...days.map((r) => r.date.slice(0, 7))])].sort().reverse()
  const inPeriod = days.filter((r) => period === 'all' || r.date.startsWith(period))
  const summary = workers
    .map((w) => {
      const mine = inPeriod.filter((r) => r.workerId === w.id)
      const on = mine.filter((r) => r.status === 'on')
      return {
        worker: w,
        daysOn: on.length,
        daysOff: mine.length - on.length,
        boxes: on.reduce((a, r) => a + (r.boxes ?? 0), 0),
        pay: on.reduce((a, r) => a + dayPay(r), 0),
      }
    })
    .filter((s) => s.daysOn + s.daysOff > 0)
  const sum = (k: 'daysOn' | 'daysOff' | 'boxes' | 'pay') => summary.reduce((a, s) => a + s[k], 0)

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Seasons', to: [] },
          { label: seasonLabel(season), to: ['season', season.id] },
          { label: 'Workers' },
        ]}
      />
      <PageHead title="Workers" sub={`${seasonLabel(season)} season · days worked, boxes prepared and pay`} />

      {/* ---------- one day ---------- */}
      <SectionHead title="Daily work" />
      {workers.length === 0 ? (
        <Empty title="No workers yet">Add your workers below. They stay in every season.</Empty>
      ) : (
        <div className="card attendance">
          <div className="date-nav">
            <button className="btn btn-ghost btn-icon" aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>
              ‹
            </button>
            <input
              id="work-date"
              className="input date-input"
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button className="btn btn-ghost btn-icon" aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))}>
              ›
            </button>
            {date !== todayISO() && (
              <button className="btn btn-ghost btn-small" onClick={() => setDate(todayISO())}>
                Today
              </button>
            )}
          </div>

          <div className="day-summary">
            <span>
              <b>{onCount}</b> of {workers.length} working
            </span>
            <span>
              <b>{formatNumber(dayBoxes, 0)}</b> boxes prepared
            </span>
            <span>
              <b>{money(dayTotal)}</b> to pay
            </span>
          </div>
          {harvestBoxes > 0 && harvestBoxes !== dayBoxes && (
            <p className="field-hint">
              Harvest records for {formatDate(date)} show {formatNumber(harvestBoxes, 0)} boxes.
            </p>
          )}

          <ul className="att-list">
            {workers.map((w) => (
              <WorkerDayRow key={`${w.id}|${date}`} season={season} worker={w} date={date} day={dayOf(w)} />
            ))}
          </ul>
        </div>
      )}

      {/* ---------- summary ---------- */}
      {workers.length > 0 && (
        <>
          <SectionHead
            title="Pay summary"
            action={
              <select
                id="pay-period"
                className="input input-compact"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                aria-label="Period"
              >
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
            <Stat label="Total to pay" value={money(sum('pay'))} />
            <Stat label="Boxes prepared" value={formatNumber(sum('boxes'), 0)} />
            <Stat label="Working days" value={formatNumber(sum('daysOn'), 0)} />
            <Stat label="Days off" value={formatNumber(sum('daysOff'), 0)} />
          </div>
          {summary.length === 0 ? (
            <Empty title="Nothing recorded in this period" />
          ) : (
            <div className="card table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th className="num">Days on</th>
                    <th className="num">Days off</th>
                    <th className="num">Boxes</th>
                    <th className="num">Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.worker.id}>
                      <td>{s.worker.name}</td>
                      <td className="num">{s.daysOn}</td>
                      <td className="num">{s.daysOff}</td>
                      <td className="num">{formatNumber(s.boxes, 0)}</td>
                      <td className="num">{money(s.pay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{sum('daysOn')}</td>
                    <td className="num">{sum('daysOff')}</td>
                    <td className="num">{formatNumber(sum('boxes'), 0)}</td>
                    <td className="num">{money(sum('pay'))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="field-hint">Pay for a day = daily salary + boxes × pay per box.</p>
        </>
      )}

      {/* ---------- worker list ---------- */}
      <SectionHead
        title="All workers"
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + Add worker
            </button>
          )
        }
      />
      <p className="field-hint">Workers you add here appear in every season.</p>
      {editing && (
        <FormCard
          title={editing === 'new' ? 'Add worker' : 'Edit worker'}
          submitLabel={editing === 'new' ? 'Save' : 'Save changes'}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label="Name">
            <input id="worker-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Phone (optional)">
            <input id="worker-phone" className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Daily salary" hint="Leave empty or 0 if paid only per box">
            <input
              id="worker-salary"
              className="input"
              inputMode="decimal"
              value={f.dailySalary}
              onChange={(e) => setF({ ...f, dailySalary: e.target.value })}
            />
          </Field>
          <Field label="Pay per box" hint="Used as the starting value each day">
            <input
              id="worker-perbox"
              className="input"
              inputMode="decimal"
              value={f.payPerBox}
              onChange={(e) => setF({ ...f, payPerBox: e.target.value })}
            />
          </Field>
          {editing !== 'new' && <p className="field-hint field-wide">New amounts apply to days marked from now on.</p>}
        </FormCard>
      )}
      {workers.length > 0 && (
        <ul className="records">
          {workers.map((w) => (
            <li key={w.id} className="card record">
              <div className="record-main">
                <span className="record-title">{w.name}</span>
                <span className="record-sub">
                  {w.dailySalary ? `${money(w.dailySalary)} per day` : 'No daily salary'} ·{' '}
                  {w.payPerBox ? `${money(w.payPerBox)} per box` : 'No pay per box'}
                </span>
                {w.phone && <span className="record-sub">{w.phone}</span>}
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
      {workers.length > 0 && <p className="field-hint">Deleting a worker also deletes their days in every season.</p>}
    </>
  )
}

/** One worker on one day: worked / day off, boxes prepared and pay per box. */
function WorkerDayRow({ season, worker, date, day }: { season: Season; worker: Worker; date: string; day?: Attendance }) {
  const money = useMoney()
  // Inputs keep their own text so typing "0." or "12," isn't interrupted.
  const [boxes, setBoxes] = useState(str(day?.boxes))
  const [perBox, setPerBox] = useState(str(day?.payPerBox ?? (worker.payPerBox || null)))
  const worked = day?.status === 'on'

  function saveBoxes(v: string) {
    setBoxes(v)
    const n = num(v)
    if (v.trim() === '' || (n !== null && n >= 0)) {
      setWorkerDay(season.id, worker, date, { status: 'on', boxes: n, payPerBox: num(perBox) })
    }
  }
  function savePerBox(v: string) {
    setPerBox(v)
    const n = num(v)
    if (worked && (v.trim() === '' || (n !== null && n >= 0))) setWorkerDay(season.id, worker, date, { payPerBox: n })
  }

  const id = `${worker.id}-${date}`
  return (
    <li className="att-row">
      <div className="att-top">
        <span className="att-name">
          {worker.name}
          <span className="stamp">{day ? `Updated ${formatDateTime(day.updatedAt)}` : 'Not marked yet'}</span>
        </span>
        <div className="segmented" role="radiogroup" aria-label={`${worker.name} on ${formatDate(date)}`}>
          <button
            type="button"
            role="radio"
            aria-checked={worked}
            className={worked ? 'is-on is-good' : ''}
            onClick={() => setWorkerDay(season.id, worker, date, { status: worked ? null : 'on', payPerBox: num(perBox) })}
          >
            Worked
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={day?.status === 'off'}
            className={day?.status === 'off' ? 'is-on is-off' : ''}
            onClick={() => {
              setBoxes('')
              setWorkerDay(season.id, worker, date, { status: day?.status === 'off' ? null : 'off' })
            }}
          >
            Day off
          </button>
        </div>
      </div>

      {day?.status !== 'off' && (
        <div className="att-work">
          <label className="mini-field" htmlFor={`${id}-boxes`}>
            <span>Boxes prepared</span>
            <input
              id={`${id}-boxes`}
              className="input"
              inputMode="numeric"
              placeholder="0"
              value={boxes}
              onChange={(e) => saveBoxes(e.target.value)}
            />
          </label>
          <span className="att-times" aria-hidden="true">
            ×
          </span>
          <label className="mini-field" htmlFor={`${id}-perbox`}>
            <span>Pay per box</span>
            <input
              id={`${id}-perbox`}
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={perBox}
              onChange={(e) => savePerBox(e.target.value)}
            />
          </label>
          <div className="att-pay">
            <span>Pay for the day</span>
            <b>{worked && day ? money(dayPay(day)) : '—'}</b>
            {worked && day && day.salary > 0 && <small>incl. {money(day.salary)} daily salary</small>}
          </div>
        </div>
      )}
    </li>
  )
}
