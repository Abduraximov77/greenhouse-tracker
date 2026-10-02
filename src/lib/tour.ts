/**
 * First-steps hints for a new farm: open a season → add a crop → pick a crop section.
 * Kept on this device only. A farm that already has crops when the app first looks never gets them,
 * so people who already use the app are not bothered.
 */
import { useSyncExternalStore } from 'react'

export type TourStep = 'season' | 'crop' | 'sections'
export const TOUR_STEPS: TourStep[] = ['season', 'crop', 'sections']

type State = { on: boolean; done: TourStep[] }
const KEY = 'agroledger:tour'
const listeners = new Set<() => void>()

function read(): State | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null
    return v && typeof v.on === 'boolean' && Array.isArray(v.done) ? v : null
  } catch {
    return null
  }
}
let state: State | null = read()

function write(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage blocked: hints still work until the app is closed
  }
  listeners.forEach((l) => l())
}

/** Decide once per device whether to show the hints: only when the farm has no crops yet. */
export function startTour(farmHasCrops: boolean) {
  if (state) return
  write({ on: !farmHasCrops, done: [] })
}

export function tourDone(step: TourStep) {
  if (!state?.on || state.done.includes(step)) return
  const done = [...state.done, step]
  write({ on: done.length < TOUR_STEPS.length, done })
}

export function skipTour() {
  write({ on: false, done: [...TOUR_STEPS] })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** True while this step's hint should be offered. */
export function useTourStep(step: TourStep) {
  return useSyncExternalStore(subscribe, () => !!state?.on && !state.done.includes(step))
}
