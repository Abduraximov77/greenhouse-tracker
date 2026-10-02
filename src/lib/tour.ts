/**
 * First-steps hints for a new farm: open a season → add a crop → pick a crop section.
 * Decided per farm (on this device): a farm with no crops yet gets the hints, a farm that already has
 * crops when it is first opened here never does, so people who already use it are not bothered.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { getCloud, subscribeCloud } from './cloud'

export type TourStep = 'season' | 'crop' | 'sections'
export const TOUR_STEPS: TourStep[] = ['season', 'crop', 'sections']

type State = { on: boolean; done: TourStep[] }
const KEY = 'agroledger:tour-farms'
const listeners = new Set<() => void>()

function readAll(): Record<string, State> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, State>
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
let all = readAll()

const farmKey = () => getCloud().session?.farmId ?? 'local'
const current = (): State | null => {
  const s = all[farmKey()]
  return s && typeof s.on === 'boolean' && Array.isArray(s.done) ? s : null
}

function write(next: State) {
  all = { ...all, [farmKey()]: next }
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage blocked: hints still work until the app is closed
  }
  listeners.forEach((l) => l())
}

/** Decide once per farm whether to show the hints: only when the farm has no crops yet. */
export function startTour(farmHasCrops: boolean) {
  if (current()) return
  write({ on: !farmHasCrops, done: [] })
}

export function tourDone(step: TourStep) {
  const s = current()
  if (!s?.on || s.done.includes(step)) return
  const done = [...s.done, step]
  write({ on: done.length < TOUR_STEPS.length, done })
}

export function skipTour() {
  write({ on: false, done: [...TOUR_STEPS] })
}

// switching farm changes which hints apply
subscribeCloud(() => listeners.forEach((l) => l()))
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** True while this step's hint should be offered for the farm that is open. */
export function useTourStep(step: TourStep) {
  return useSyncExternalStore(subscribe, () => {
    const s = current()
    return !!s?.on && !s.done.includes(step)
  })
}

/** Decide for the farm that is open (again after switching farm). */
export function useStartTour(farmHasCrops: boolean) {
  const farm = useSyncExternalStore(subscribeCloud, farmKey)
  useEffect(() => startTour(farmHasCrops), [farmHasCrops, farm])
}
