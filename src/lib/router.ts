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
