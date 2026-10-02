import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../lib/i18n'
import { TOUR_STEPS, skipTour, tourDone, type TourStep } from '../lib/tour'

type Box = { top: number; left: number; width: number; height: number }
const PAD = 6

/**
 * Darkens the screen, lights up one control (found by `target`, a CSS selector) with an arrow,
 * and explains it in a small card. The lit-up control can still be tapped; the rest is blocked
 * until "Got it" or "Skip". Shows nothing while the control is not on the page.
 */
export function Coachmark({ step, target, title, text }: { step: TourStep; target: string; title: string; text: string }) {
  const t = useT()
  const [box, setBox] = useState<Box | null>(null)

  useLayoutEffect(() => {
    let first = true
    let last = ''
    const measure = () => {
      const el = document.querySelector<HTMLElement>(target)
      // not on the page, or the app is still behind the loading screen
      if (!el || !el.offsetParent || el.closest('[aria-hidden="true"]')) {
        if (last !== 'none') setBox(null)
        last = 'none'
        return
      }
      if (first) {
        first = false
        // bring the control near the top, so the card fits under it
        const top = el.getBoundingClientRect().top
        window.scrollBy({ top: top - 110, behavior: 'instant' as ScrollBehavior })
      }
      const r = el.getBoundingClientRect()
      const key = [r.top, r.left, r.width, r.height].map(Math.round).join()
      if (key === last) return
      last = key
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
    }
    measure()
    // the page can still move (fonts, weather card loading, the phone turning): follow the control
    const timer = window.setInterval(measure, 250)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [target])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && tourDone(step)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  if (!box) return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const below = box.top + box.height + 300 < vh || box.top < 300
  const cx = Math.min(Math.max(box.left + box.width / 2, 40), vw - 40)
  const n = TOUR_STEPS.indexOf(step) + 1

  return createPortal(
    <div className="coach" role="dialog" aria-modal="true" aria-labelledby="coach-title">
      {/* four blockers around the lit-up control */}
      <div className="coach-block" style={{ top: 0, left: 0, right: 0, height: Math.max(box.top, 0) }} />
      <div className="coach-block" style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
      <div className="coach-block" style={{ top: box.top, left: 0, width: Math.max(box.left, 0), height: box.height }} />
      <div className="coach-block" style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
      <div className="coach-ring" style={box} />
      <svg
        className="coach-arrow"
        width="60"
        height="56"
        viewBox="0 0 60 56"
        aria-hidden="true"
        style={{
          left: cx - (cx > vw / 2 ? 50 : 10),
          top: below ? box.top + box.height + 8 : box.top - 64,
          transform: `scale(${cx > vw / 2 ? 1 : -1}, ${below ? 1 : -1})`,
        }}
      >
        <path d="M10 52C14 32 28 16 46 6" />
        <path d="M34 4h12v12" />
      </svg>
      <div className="coach-card" style={below ? { top: box.top + box.height + 72 } : { bottom: vh - box.top + 72 }}>
        <span className="coach-step">{t('Step {n} of {total}', { n, total: TOUR_STEPS.length })}</span>
        <h2 id="coach-title" className="coach-title">
          {title}
        </h2>
        <p className="coach-text">{text}</p>
        <div className="coach-foot">
          <span className="coach-dots" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span key={s} className={i + 1 === n ? 'is-on' : ''} />
            ))}
          </span>
          <span className="coach-buttons">
            <button type="button" className="coach-skip" onClick={skipTour}>
              {t('Skip tips')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => tourDone(step)} autoFocus>
              {t('Got it')}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
