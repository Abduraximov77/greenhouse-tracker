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
// We keep our own list of visited pages, so "Back" always stays inside the app.

const visited: string[] = [getHash()]
let goingBack = false

window.addEventListener('hashchange', () => {
  const h = getHash()
  if (goingBack) {
    goingBack = false
    return
  }
  if (visited.length > 1 && visited[visited.length - 2] === h)
    visited.pop() // browser back button
  else if (visited[visited.length - 1] !== h) visited.push(h)
})

/** The page one level up: a crop section → the season, a season → the seasons list. */
function parentOf(hash: string) {
  const p = hash.split('/').filter(Boolean)
  if (p[0] === 'season' && p.length > 2) return `/season/${p[1]}`
  return '/'
}

export function goBack() {
  const target = visited.length > 1 ? visited[visited.length - 2] : parentOf(getHash())
  if (visited.length > 1) visited.pop()
  else visited[0] = target
  goingBack = true
  // replace, so going back doesn't add another step to the browser history
  window.location.replace(`${window.location.href.split('#')[0]}#${target}`)
  window.scrollTo({ top: 0 })
}
