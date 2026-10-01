/** Tiny hash router: #/season/<id>/crop/<id>/<tab>. Works on any static host. */
import { useSyncExternalStore } from 'react'

function getHash() {
  return window.location.hash.replace(/^#/, '') || '/'
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function usePath(): string[] {
  const hash = useSyncExternalStore(subscribe, getHash)
  return hash.split('/').filter(Boolean).map(decodeURIComponent)
}

export function href(...parts: string[]) {
  return '#/' + parts.map(encodeURIComponent).join('/')
}

export function navigate(...parts: string[]) {
  window.location.hash = href(...parts).slice(1)
  window.scrollTo({ top: 0 })
}

// ---------- Back button ----------
// "Back" goes one level up in the app (a crop section → the crop's overview → the season → the
// seasons list), not back through the pages you happened to open.

/** The page one level up. */
function parentOf(hash: string) {
  const p = hash.split('/').filter(Boolean)
  if (p[0] === 'season' && p[2] === 'crop' && p[3]) {
    // a crop section (expenses, harvest…) → the crop's overview; the overview → the season
    if (p[4] && p[4] !== 'overview') return `/season/${p[1]}/crop/${p[3]}`
    return `/season/${p[1]}`
  }
  if (p[0] === 'season' && p.length > 2) return `/season/${p[1]}`
  if (p[0] === 'settings' && p.length > 1) return '/settings'
  return '/'
}

export function goBack() {
  const target = parentOf(getHash())
  // replace, so going back doesn't add another step to the browser history
  window.location.replace(`${window.location.href.split('#')[0]}#${target}`)
  window.scrollTo({ top: 0 })
}
