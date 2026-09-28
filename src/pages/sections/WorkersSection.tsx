import { useState } from 'react'
import {
  addRecord,
  attendanceKey,
  cropDays,
  dayPay,
  removeRecord,
  setDayOffForAll,
  setWorkerDaysPaid,
  setAttendancePayments,
  type PayStatus,
  payment,
  setWorkerDay,
  daysBetween,
  updateRecord,
  useDB,
  type Attendance,
  type SeasonCrop,
  type Worker,
} from '../../lib/store'
import { formatDate, formatDateTime, formatMonth, formatNumber, todayISO } from '../../lib/format'
import { convert, useCurrency, sumIn } from '../../lib/money'
import { PartialPay } from '../../components/PartialPay'
import { PaymentControl } from '../../components/PaymentControl'
import { useT } from '../../lib/i18n'
import { DeleteButton, Empty, Field, FormCard, MoneyInput, RateMissing, SectionHead, Stat, num, str } from '../../components/ui'

function lastDayOfMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 0).getDate()
  return `${ym}-${String(d).padStart(2, '0')}`
}

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

  const [date, setDateRaw] = useState(todayISO())
  // Bumped after "day off for everyone" so the rows reset their inputs.
  const [bulk, setBulk] = useState(0)
  const [confirmOff, setConfirmOff] = useState(false)
  const setDate = (d: string) => {
    setDateRaw(d)
    setConfirmOff(false)
  }
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
  const allOff = workers.length > 0 && workers.every((w) => dayOf(w)?.status === 'off')
  const dayBoxes = todays.reduce((a, d) => a + (d.boxes ?? 0), 0)
  const dayPaid = sumIn(
    todays.filter((d) => d.status === 'on').map((d) => ({ amount: payment(dayPay(d), d.payStatus, d.paidAmount).paid, currency: d.currency })),
    cur.display,
    cur.rates,
  )
  const dayNonePaid = todays.filter((d) => d.status === 'on').every((d) => d.payStatus === 'unpaid')
  const dayAllPaid = todays.some((d) => d.status === 'on') && todays.filter((d) => d.status === 'on').every((d) => d.payStatus === 'paid')
  const dayTotal = sumIn(todays.map((d) => ({ amount: dayPay(d), currency: d.currency })), cur.display, cur.rates)

  // ----- summary for the chosen period -----
  const months = [...new Set([currentMonth, ...days.map((r) => r.date.slice(0, 7))])].sort().reverse()
  const inThisPeriod = (a: Attendance) => period === 'all' || a.date.startsWith(period)
  const inPeriod = days.filter((r) => period === 'all' || r.date.startsWith(period))
  // The counted range runs from the first recorded day on this crop (or the month start)
  // up to today (or the month end), so future days and days before work began don't count.
  const firstDay = days.map((r) => r.date).sort()[0]
  const today = todayISO()
  const rangeFrom = firstDay ? (period === 'all' ? firstDay : [firstDay, `${period}-01`].sort()[1]) : ''
  const rangeTo = [today, period === 'all' ? today : lastDayOfMonth(period)].sort()[0]
  const rangeDays = firstDay ? daysBetween(rangeFrom, rangeTo) : 0
  const inRange = (d: string) => d >= rangeFrom && d <= rangeTo
  const summary = workers
    .map((w) => {
      const mine = inPeriod.filter((r) => r.workerId === w.id)
      const on = mine.filter((r) => r.status === 'on')
      return {
        worker: w,
        daysOn: on.length,
        // A worker's day off = every day in the range they didn't work (marked or not).
        daysOff: Math.max(0, rangeDays - new Set(on.filter((r) => inRange(r.date)).map((r) => r.date)).size),
        boxes: on.reduce((a, r) => a + (r.boxes ?? 0), 0),
        pay: sumIn(on.map((r) => ({ amount: dayPay(r), currency: r.currency })), cur.display, cur.rates),
        paid: sumIn(
          on.map((r) => ({ amount: payment(dayPay(r), r.payStatus, r.paidAmount).paid, currency: r.currency })),
          cur.display,
          cur.rates,
        ),
      }
    })
    .filter((s) => s.daysOn > 0 || inPeriod.some((r) => r.workerId === s.worker.id))
  const sum = (k: 'boxes') => summary.reduce((a, s) => a + s[k], 0)
  const payTotal = summary.reduce((a, s) => a + s.pay.total, 0)
  const paidTotal = summary.reduce((a, s) => a + s.paid.total, 0)
  // Calendar days, not worker-days: a day counts once however many people worked.
  const workDates = new Set(inPeriod.filter((r) => r.status === 'on').map((r) => r.date))
  // Days off for everyone = every day in the range with nobody working, including days with nothing recorded.
  const offCount = Math.max(0, rangeDays - [...workDates].filter(inRange).length)
  const payMissing = summary.some((s) => s.pay.missing)

  /**
   * Apply a payment (in the display currency) to unpaid days, oldest first:
   * days it fully covers become paid, the last one becomes partly paid.
   */
  function applyPayment(amount: number, match: (a: Attendance) => boolean) {
    const nameOf = (id: string) => workers.find((w) => w.id === id)?.name ?? ''
    const open = inPeriod
      .filter((a) => a.status === 'on' && match(a))
      .sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.workerId).localeCompare(nameOf(b.workerId)))
    let left = amount
    const updates: Record<string, { payStatus: PayStatus; paidAmount: number | null }> = {}
    for (const a of open) {
      if (left <= 0.005) break
      const due = dayPay(a)
      const already = payment(due, a.payStatus, a.paidAmount).paid
      const owedHere = due - already
      if (owedHere <= 0) continue
      const owedInDisplay = convert(owedHere, a.currency, cur.display, cur.rates) ?? owedHere
      const key = attendanceKey(a.cropId, a.workerId, a.date)
      if (left + 0.005 >= owedInDisplay) {
        updates[key] = { payStatus: 'paid', paidAmount: null }
        left -= owedInDisplay
      } else {
        const partInDayCurrency = convert(left, cur.display, a.currency, cur.rates) ?? left
        updates[key] = { payStatus: 'partial', paidAmount: Math.round((already + partInDayCurrency) * 100) / 100 }
        left = 0
      }
    }
    setAttendancePayments(updates)
    setBulk((n) => n + 1)
  }

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
            <button
              type="button"
              className={`btn btn-small day-off-all${allOff ? ' is-on' : ''}`}
              aria-pressed={allOff}
              onClick={() => {
                if (!allOff && onCount > 0 && !confirmOff) return setConfirmOff(true)
                setDayOffForAll(crop, workers, date, !allOff)
                setConfirmOff(false)
                setBulk((n) => n + 1)
              }}
            >
              {allOff ? `✓ ${t('Day off for everyone')}` : confirmOff ? t('Tap again: boxes for this day will be cleared') : t('Day off for everyone')}
            </button>
          </div>
          {allOff && <p className="day-off-note">{t('Nobody works on this day. Tap the button again to undo.')}</p>}
          {!allOff && onCount === 0 && firstDay && date >= firstDay && date < todayISO() && (
            <p className="day-off-note">{t('Nobody worked on this day, so it counts as a day off for everyone.')}</p>
          )}

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
            <span>
              {t('Paid')}: <b>{cur.fmt(dayPaid.total)}</b>
            </span>
          </div>
          {onCount > 0 && dayTotal.total > 0 && (
            <div className="all-pay">
              <span className="all-pay-label">{t('All workers, this day')}:</span>
              <div className="segmented" role="radiogroup" aria-label={t('All workers, this day')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={dayNonePaid}
                  className={dayNonePaid ? 'is-on is-off' : ''}
                  onClick={() => {
                    setWorkerDaysPaid(crop.id, (a) => a.date === date, false)
                    setBulk((n) => n + 1)
                  }}
                >
                  {t('Not paid')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={dayAllPaid}
                  className={dayAllPaid ? 'is-on is-good' : ''}
                  onClick={() => {
                    setWorkerDaysPaid(crop.id, (a) => a.date === date, true)
                    setBulk((n) => n + 1)
                  }}
                >
                  {t('Paid')}
                </button>
              </div>
              {!dayAllPaid && !dayNonePaid && <span className="field-hint">{t('Some are paid, some are not')}</span>}
            </div>
          )}
          <p className="field-hint">{t('Boxes entered here are added to the Harvest for this day.')}</p>

          <ul className="att-list">
            {workers.map((w) => (
              <WorkerDayRow key={`${w.id}|${date}|${bulk}`} crop={crop} worker={w} date={date} day={dayOf(w)} />
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
            <Stat label={t('Earned')} value={cur.fmt(payTotal)} />
            <Stat label={t('Paid')} value={cur.fmt(paidTotal)} tone={paidTotal > 0 ? 'good' : undefined} />
            <Stat label={t('Still to pay')} value={cur.fmt(payTotal - paidTotal)} tone={payTotal - paidTotal > 0 ? 'warn' : undefined} />
            <Stat label={t('Boxes prepared')} value={formatNumber(sum('boxes'), 0)} />
            <Stat label={t('Working days')} value={formatNumber(workDates.size, 0)} />
            <Stat label={t('Days off')} value={formatNumber(offCount, 0)} />
          </div>
          <RateMissing show={payMissing || dayTotal.missing} />
          {summary.length > 0 && (
            <div className="all-pay period-pay">
              <span className="all-pay-label">
                {period === 'all' ? t('Whole season') : formatMonth(period)}, {t('all workers')}:
              </span>
              {payTotal - paidTotal > 0 ? (
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={() => {
                    setWorkerDaysPaid(crop.id, inThisPeriod, true)
                    setBulk((n) => n + 1)
                  }}
                >
                  ✓ {t('Mark everyone paid ({amount})', { amount: cur.fmt(payTotal - paidTotal) })}
                </button>
              ) : null}
              {payTotal - paidTotal > 0 && (
                <PartialPay
                  id="pay-all-partial"
                  owed={payTotal - paidTotal}
                  currency={cur.display}
                  onApply={(amount) => applyPayment(amount, () => true)}
                />
              )}
              {payTotal - paidTotal <= 0 && (
                <>
                  <span className="pay-badge paid">{t('Everyone is paid')}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      setWorkerDaysPaid(crop.id, inThisPeriod, false)
                      setBulk((n) => n + 1)
                    }}
                  >
                    {t('Undo')}
                  </button>
                </>
              )}
              {payTotal - paidTotal > 0 && (
                <span className="field-hint all-pay-note">{t('A partial payment pays the oldest unpaid days first.')}</span>
              )}
            </div>
          )}
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
                    <th className="num">{t('Earned')}</th>
                    <th className="num">{t('Paid')}</th>
                    <th className="num">{t('Still to pay')}</th>
                    <th>
                      <span className="sr-only">{t('Payment')}</span>
                    </th>
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
                      <td className="num">{cur.fmt(s.paid.total)}</td>
                      <td className="num text-owed">{cur.fmt(s.pay.total - s.paid.total)}</td>
                      <td>
                        {s.pay.total - s.paid.total > 0 ? (
                          <div className="pay-cell">
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => {
                                setWorkerDaysPaid(crop.id, (a) => a.workerId === s.worker.id && inThisPeriod(a), true)
                                setBulk((n) => n + 1)
                              }}
                            >
                              ✓ {t('Paid')}
                            </button>
                            <PartialPay
                              id={`pay-${s.worker.id}`}
                              owed={s.pay.total - s.paid.total}
                              currency={cur.display}
                              onApply={(amount) => applyPayment(amount, (a) => a.workerId === s.worker.id)}
                            />
                          </div>
                        ) : (
                          s.pay.total > 0 && <span className="pay-badge paid">{t('Paid')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t('Total')}</td>
                    <td className="num">{workDates.size}</td>
                    <td className="num">{offCount}</td>
                    <td className="num">{formatNumber(sum('boxes'), 0)}</td>
                    <td className="num">{cur.fmt(payTotal)}</td>
                    <td className="num">{cur.fmt(paidTotal)}</td>
                    <td className="num text-owed">{cur.fmt(payTotal - paidTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="field-hint">
            {t('Pay for a day = daily salary + boxes × pay per box.')}{' '}
            {t('Working days count each calendar day once. Every day with nobody working counts as a day off, even if nothing was entered.')}
          </p>
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
  const [salary, setSalary] = useState(str(day ? day.salary : worker.dailySalary || null))
  const [boxes, setBoxes] = useState(str(day?.boxes))
  const [perBox, setPerBox] = useState(str(day?.payPerBox ?? (worker.payPerBox || null)))
  const worked = day?.status === 'on'
  const ok = (v: string) => v.trim() === '' || ((num(v) ?? -1) >= 0)

  function saveSalary(v: string) {
    setSalary(v)
    if (ok(v)) setWorkerDay(crop, worker, date, { status: 'on', salary: num(v) ?? 0, boxes: num(boxes), payPerBox: num(perBox) })
  }
  function saveBoxes(v: string) {
    setBoxes(v)
    if (ok(v)) setWorkerDay(crop, worker, date, { status: 'on', boxes: num(v), payPerBox: num(perBox), salary: num(salary) ?? 0 })
  }
  function savePerBox(v: string) {
    setPerBox(v)
    if (worked && ok(v)) setWorkerDay(crop, worker, date, { payPerBox: num(v) })
  }

  const id = `${worker.id}-${date}`
  const due = worked && day ? dayPay(day) : 0
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
            onClick={() =>
              setWorkerDay(crop, worker, date, {
                status: worked ? null : 'on',
                payPerBox: num(perBox),
                salary: num(salary) ?? 0,
              })
            }
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
          <label className="mini-field" htmlFor={`${id}-salary`}>
            <span>
              {t('Daily salary')} ({currency})
            </span>
            <input
              id={`${id}-salary`}
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={salary}
              onChange={(e) => saveSalary(e.target.value)}
            />
          </label>
          <span className="att-times" aria-hidden="true">
            +
          </span>
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
            <b>{worked && day ? cur.both(due, day.currency) : '—'}</b>
          </div>
        </div>
      )}

      {worked && day && due > 0 && (
        <PaymentControl
          id={id}
          due={due}
          currency={day.currency}
          status={day.payStatus}
          paidAmount={day.paidAmount}
          onChange={(payStatus, paidAmount) => setWorkerDay(crop, worker, date, { payStatus, paidAmount })}
        />
      )}
    </li>
  )
}
