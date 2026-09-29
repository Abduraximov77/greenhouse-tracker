import { useEffect, useMemo, useRef, useState } from 'react'
import { currentLang } from '../lib/store'
import { formatDayLong, formatNumber, todayISO } from '../lib/format'
import { useT } from '../lib/i18n'

const UZ_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek']

function parse(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function iso(dt: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}
/** "28 sen" — short date for the axis. */
function shortDate(d: string) {
  const dt = parse(d)
  const lang = currentLang()
  if (lang === 'uz') return `${dt.getDate()} ${UZ_SHORT[dt.getMonth()]}`
  return dt.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' }).replace('.', '')
}
/** Round an axis maximum up to a friendly number (10, 20, 50, 100, 200, 500…). */
function niceMax(v: number) {
  if (v <= 0) return 10
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

/**
 * Line chart of boxes packed per day. Every calendar day from the first harvest to today is shown,
 * so days with nothing packed appear as 0 instead of being skipped.
 */
export function BoxesChart({ perDay }: { perDay: Map<string, number> }) {
  const t = useT()
  const [range, setRange] = useState<'30' | 'all'>('30')
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = useMemo(() => {
    const dates = [...perDay.keys()].sort()
    if (dates.length === 0) return []
    const last = [dates.at(-1)!, todayISO()].sort()[1]
    let start = dates[0]
    if (range === '30') {
      const from = parse(last)
      from.setDate(from.getDate() - 29)
      start = [start, iso(from)].sort()[1]
    }
    const out: { date: string; boxes: number }[] = []
    for (let d = parse(start); iso(d) <= last; d.setDate(d.getDate() + 1)) out.push({ date: iso(d), boxes: perDay.get(iso(d)) ?? 0 })
    return out
  }, [perDay, range])

  if (points.length === 0) return null

  // Geometry
  const H = 240
  const pad = { l: 44, r: 16, t: 16, b: 30 }
  const w = width - pad.l - pad.r
  const h = H - pad.t - pad.b
  const max = niceMax(Math.max(...points.map((p) => p.boxes)))
  const x = (i: number) => pad.l + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w)
  const y = (v: number) => pad.t + h - (v / max) * h
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.boxes).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  // About one date label per 90px, always including the first and the last day.
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 90))))
  const labelled = points.map((_, i) => i).filter((i) => i % every === 0 && points.length - 1 - i >= every / 2)
  labelled.push(points.length - 1)
  const showDots = points.length <= 45
  const lastI = points.length - 1
  const total = points.reduce((a, p) => a + p.boxes, 0)
  const workDays = points.filter((p) => p.boxes > 0).length

  function onMove(clientX: number) {
    const rect = wrapRef.current?.querySelector('svg')?.getBoundingClientRect()
    if (!rect) return
    const px = ((clientX - rect.left) / rect.width) * width
    const i = points.length === 1 ? 0 : Math.round(((px - pad.l) / w) * (points.length - 1))
    setHover(Math.min(points.length - 1, Math.max(0, i)))
  }

  const hp = hover !== null ? points[hover] : null
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover), 90), width - 90) : 0

  return (
    <section className="card chart-card" aria-label={t('Boxes packed per day')}>
      <div className="chart-head">
        <div>
          <h3 className="chart-title">{t('Boxes packed per day')}</h3>
          <p className="chart-sub">
            {t('{total} boxes in {days} working days · average {avg} a day', {
              total: formatNumber(total, 0),
              days: workDays,
              avg: formatNumber(workDays ? total / workDays : 0, 0),
            })}
          </p>
        </div>
        <div className="segmented chart-range" role="radiogroup" aria-label={t('Period')}>
          {(
            [
              ['30', t('Last 30 days')],
              ['all', t('Whole season')],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={range === k} className={range === k ? 'is-on is-good' : ''} onClick={() => setRange(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="chart-plot"
        ref={wrapRef}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={t('Boxes packed per day')}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'chart-base' : 'chart-grid'} />
              <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="chart-axis">
                {formatNumber(v, 0)}
              </text>
            </g>
          ))}
          {labelled.map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === lastI ? 'end' : 'middle'} className="chart-axis">
              {shortDate(points[i].date)}
            </text>
          ))}
          <path d={area} className="chart-area" />
          <path d={line} className="chart-line" />
          {showDots && points.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.boxes)} r={3} className="chart-dot" />)}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} className="chart-cross" />
              <circle cx={x(hover)} cy={y(points[hover].boxes)} r={5.5} className="chart-dot chart-dot-on" />
            </>
          )}
          {hover === null && <circle cx={x(lastI)} cy={y(points[lastI].boxes)} r={5} className="chart-dot chart-dot-on" />}
        </svg>
        {hp && (
          <div className="chart-tip" style={{ left: tipLeft }}>
            <span>{formatDayLong(hp.date)}</span>
            <b>{t('{n} boxes', { n: formatNumber(hp.boxes, 0) })}</b>
          </div>
        )}
      </div>
      <p className="chart-note">
        {t('Latest day')}: {shortDate(points[lastI].date)} · <b>{t('{n} boxes', { n: formatNumber(points[lastI].boxes, 0) })}</b>
      </p>

      <table className="sr-only">
        <caption>{t('Boxes packed per day')}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{formatDayLong(p.date)}</th>
              <td>{p.boxes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
