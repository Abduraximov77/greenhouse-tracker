import { useState } from 'react'
import {
  addRecord,
  attendanceKey,
  cropDays,
  dayPay,
  removeRecord,
  setWorkerDay,
  updateRecord,
  useDB,
  type Attendance,
  type SeasonCrop,
  type Worker,
} from '../../lib/store'
import { formatDate, formatDateTime, formatMonth, formatNumber, todayISO } from '../../lib/format'
import { useCurrency, sumIn } from '../../lib/money'
import { useT } from '../../lib/i18n'
import { DeleteButton, Empty, Field, FormCard, MoneyInput, RateMissing, SectionHead, Stat, num, str } from '../../components/ui'

function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export function WorkersSection({ crop }: { crop: SeasonCrop }) {
  const db = useDB()
  const t = useT()
  const cur = useCurrency()
  // The worker list is shared by every season and crop.
  const workers = [...db.workers].sort((a, b) => a.name.localeCompare(b.name))
  const days = cropDays(db, crop.id)

  const [date, setDate] = useState(todayISO())
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [f, setF] = useState({ name: '', phone: '', dailySalary: '', payPerBox: '', currency: '' })
  const [error, setError] = useState<string | null>(null)
  const currentMonth = todayISO().slice(0, 7)
  const [period, setPeriod] = useState<string>(currentMonth)

  function open(w?: Worker) {
    setError(null)
    const last = workers.at(-1)
    setF(
      w
        ? { name: w.name, phone: w.phone, dailySalary: str(w.dailySalary), payPerBox: str(w.payPerBox), currency: w.currency }
        : {
            name: '',
            phone: '',
            dailySalary: str(last?.dailySalary),
            payPerBox: str(last?.payPerBox),
            currency: last?.currency ?? cur.display,
          },
    )
    setEditing(w ? w.id : 'new')
  }

  function submit() {
    const salary = num(f.dailySalary) ?? 0
    const perBox = num(f.payPerBox) ?? 0
    if (!f.name.trim()) return setError(t("Enter the worker's name."))
    if (salary < 0 || perBox < 0) return setError(t('Amounts cannot be negative.'))
    const data = { name: f.name.trim(), phone: f.phone.trim(), dailySalary: salary, payPerBox: perBox, currency: f.currency }
    if (editing === 'new') addRecord('workers', data)
    else if (editing) updateRecord('workers', editing, data)
    setEditing(null)
  }

  // ----- the chosen day -----
  const dayOf = (w: Worker) => db.attendance[attendanceKey(crop.id, w.id, date)]
  const todays = workers.map(dayOf).filter(Boolean) as Attendance[]
  const onCount = todays.filter((a) => a.status === 'on').length
  const dayBoxes = todays.reduce((a, d) => a + (d.boxes ?? 0), 0)
  const dayTotal = sumIn(todays.map((d) => ({ amount: dayPay(d), currency: d.currency })), cur.display, cur.rates)

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
        pay: sumIn(on.map((r) => ({ amount: dayPay(r), currency: r.currency })), cur.display, cur.rates),
      }
    })
    .filter((s) => s.daysOn + s.daysOff > 0)
  const sum = (k: 'daysOn' | 'daysOff' | 'boxes') => summary.reduce((a, s) => a + s[k], 0)
  const payTotal = summary.reduce((a, s) => a + s.pay.total, 0)
  const payMissing = summary.some((s) => s.pay.missing)

  return (
    <>
      <SectionHead title={t('Daily work')} />
      {workers.length === 0 ? (
        <Empty title={t('No workers yet')}>{t('Add your workers below. They stay in every season and crop.')}</Empty>
      ) : (
        <div className="card attendance">
          <div className="date-nav">
            <button className="btn btn-ghost btn-icon" aria-label={t('Previous day')} onClick={() => setDate(shiftDate(date, -1))}>
              ‹
            </button>
            <input
              id="work-date"
              className="input date-input"
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button className="btn btn-ghost btn-icon" aria-label={t('Next day')} onClick={() => setDate(shiftDate(date, 1))}>
              ›
            </button>
            {date !== todayISO() && (
              <button className="btn btn-ghost btn-small" onClick={() => setDate(todayISO())}>
                {t('Today')}
              </button>
            )}
          </div>

          <div className="day-summary">
            <span>
              {t('Working')}: <b>{onCount}</b> / {workers.length}
            </span>
            <span>
              {t('Boxes prepared')}: <b>{formatNumber(dayBoxes, 0)}</b>
            </span>
            <span>
              {t('To pay')}: <b>{cur.fmt(dayTotal.total)}</b>
            </span>
          </div>
          <p className="field-hint">{t('Boxes entered here are added to the Harvest for this day.')}</p>

          <ul className="att-list">
            {workers.map((w) => (
              <WorkerDayRow key={`${w.id}|${date}`} crop={crop} worker={w} date={date} day={dayOf(w)} />
            ))}
          </ul>
        </div>
      )}

      {workers.length > 0 && (
        <>
          <SectionHead
            title={t('Pay summary')}
            action={
              <select
                id="pay-period"
                className="input input-compact"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                aria-label={t('Period')}
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonth(m)}
                  </option>
                ))}
                <option value="all">{t('Whole season')}</option>
              </select>
            }
          />
          <div className="stat-grid">
            <Stat label={t('Total to pay')} value={cur.fmt(payTotal)} />
            <Stat label={t('Boxes prepared')} value={formatNumber(sum('boxes'), 0)} />
            <Stat label={t('Working days')} value={formatNumber(sum('daysOn'), 0)} />
            <Stat label={t('Days off')} value={formatNumber(sum('daysOff'), 0)} />
          </div>
          <RateMissing show={payMissing || dayTotal.missing} />
          {summary.length === 0 ? (
            <Empty title={t('Nothing recorded in this period')} />
          ) : (
            <div className="card table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Worker')}</th>
                    <th className="num">{t('Days on')}</th>
                    <th className="num">{t('Days off')}</th>
                    <th className="num">{t('Boxes')}</th>
                    <th className="num">{t('Pay')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.worker.id}>
                      <td>{s.worker.name}</td>
                      <td className="num">{s.daysOn}</td>
                      <td className="num">{s.daysOff}</td>
                      <td className="num">{formatNumber(s.boxes, 0)}</td>
                      <td className="num">{cur.fmt(s.pay.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t('Total')}</td>
                    <td className="num">{sum('daysOn')}</td>
                    <td className="num">{sum('daysOff')}</td>
                    <td className="num">{formatNumber(sum('boxes'), 0)}</td>
                    <td className="num">{cur.fmt(payTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="field-hint">{t('Pay for a day = daily salary + boxes × pay per box.')}</p>
        </>
      )}

      <SectionHead
        title={t('All workers')}
        action={
          !editing && (
            <button className="btn btn-primary" onClick={() => open()}>
              + {t('Add worker')}
            </button>
          )
        }
      />
      <p className="field-hint">{t('Workers you add here appear in every season and crop.')}</p>
      {editing && (
        <FormCard
          title={editing === 'new' ? t('Add worker') : t('Edit worker')}
          submitLabel={editing === 'new' ? t('Save') : t('Save changes')}
          onCancel={() => setEditing(null)}
          onSubmit={submit}
          error={error}
        >
          <Field label={t('Name')}>
            <input id="worker-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t('Phone (optional)')}>
            <input id="worker-phone" className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label={t('Daily salary')} hint={t('Leave empty or 0 if paid only per box')}>
            <MoneyInput
              id="worker-salary"
              value={f.dailySalary}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, dailySalary: v })}
            />
          </Field>
          <Field label={t('Pay per box')} hint={t('Used as the starting value each day')}>
            <MoneyInput
              id="worker-perbox"
              value={f.payPerBox}
              currency={f.currency}
              onCurrency={(c) => setF({ ...f, currency: c })}
              onChange={(v) => setF({ ...f, payPerBox: v })}
            />
          </Field>
          {editing !== 'new' && <p className="field-hint field-wide">{t('New amounts apply to days marked from now on.')}</p>}
        </FormCard>
      )}
      {workers.length > 0 && (
        <ul className="records">
          {workers.map((w) => (
            <li key={w.id} className="card record">
              <div className="record-main">
                <span className="record-title">{w.name}</span>
                <span className="record-sub">
                  {w.dailySalary ? t('{amount} per day', { amount: cur.fmt(w.dailySalary, w.currency) }) : t('No daily salary')} ·{' '}
                  {w.payPerBox ? t('{amount} per box', { amount: cur.fmt(w.payPerBox, w.currency) }) : t('No pay per box')}
                </span>
                {w.phone && <span className="record-sub">{w.phone}</span>}
                <span className="stamp">{t('Added {time}', { time: formatDateTime(w.createdAt) })}</span>
              </div>
              <div className="record-actions">
                <button className="btn btn-ghost btn-small" onClick={() => open(w)}>
                  {t('Edit')}
                </button>
                <DeleteButton onDelete={() => removeRecord('workers', w.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {workers.length > 0 && <p className="field-hint">{t('Deleting a worker also deletes all their days, in every season.')}</p>}
    </>
  )
}

/** One worker on one day: worked / day off, boxes prepared and pay per box. */
function WorkerDayRow({ crop, worker, date, day }: { crop: SeasonCrop; worker: Worker; date: string; day?: Attendance }) {
  const t = useT()
  const cur = useCurrency()
  const currency = day?.currency ?? worker.currency
  // Inputs keep their own text so typing "0." or "12," isn't interrupted.
  const [boxes, setBoxes] = useState(str(day?.boxes))
  const [perBox, setPerBox] = useState(str(day?.payPerBox ?? (worker.payPerBox || null)))
  const worked = day?.status === 'on'

  function saveBoxes(v: string) {
    setBoxes(v)
    const n = num(v)
    if (v.trim() === '' || (n !== null && n >= 0)) {
      setWorkerDay(crop, worker, date, { status: 'on', boxes: n, payPerBox: num(perBox) })
    }
  }
  function savePerBox(v: string) {
    setPerBox(v)
    const n = num(v)
    if (worked && (v.trim() === '' || (n !== null && n >= 0))) setWorkerDay(crop, worker, date, { payPerBox: n })
  }

  const id = `${worker.id}-${date}`
  return (
    <li className="att-row">
      <div className="att-top">
        <span className="att-name">
          {worker.name}
          <span className="stamp">
            {day ? t('Updated {time}', { time: formatDateTime(day.updatedAt) }) : t('Not marked yet')}
          </span>
        </span>
        <div className="segmented" role="radiogroup" aria-label={`${worker.name}, ${formatDate(date)}`}>
          <button
            type="button"
            role="radio"
            aria-checked={worked}
            className={worked ? 'is-on is-good' : ''}
            onClick={() => setWorkerDay(crop, worker, date, { status: worked ? null : 'on', payPerBox: num(perBox) })}
          >
            {t('Worked')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={day?.status === 'off'}
            className={day?.status === 'off' ? 'is-on is-off' : ''}
            onClick={() => {
              setBoxes('')
              setWorkerDay(crop, worker, date, { status: day?.status === 'off' ? null : 'off' })
            }}
          >
            {t('Day off')}
          </button>
        </div>
      </div>

      {day?.status !== 'off' && (
        <div className="att-work">
          <label className="mini-field" htmlFor={`${id}-boxes`}>
            <span>{t('Boxes prepared')}</span>
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
            <span>
              {t('Pay per box')} ({currency})
            </span>
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
            <span>{t('Pay for the day')}</span>
            <b>{worked && day ? cur.both(dayPay(day), day.currency) : '—'}</b>
            {worked && day && day.salary > 0 && (
              <small>{t('incl. {amount} daily salary', { amount: cur.fmt(day.salary, day.currency) })}</small>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
