import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useT } from '../lib/i18n'
import { formatNumber } from '../lib/format'

/** Where to start when no place is known yet: Uzbekistan. */
const START = { lat: 41.3, lon: 66.5, zoom: 6 }

// A plain round pin drawn with CSS, so no marker image files are needed.
const pin = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 26] })

/**
 * Tap the map to put the pin exactly on the greenhouse; the pin can be dragged too.
 * Map: OpenStreetMap.
 */
export default function MapPicker({
  start,
  onPick,
  onCancel,
}: {
  start: { lat: number; lon: number } | null
  onPick: (p: { lat: number; lon: number }) => void
  onCancel: () => void
}) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(start)

  useEffect(() => {
    if (!box.current) return
    const map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(
      start ? [start.lat, start.lon] : [START.lat, START.lon],
      start ? 15 : START.zoom,
    )
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map)
    let marker: L.Marker | null = null
    const place = (lat: number, lon: number) => {
      const p = { lat: Math.round(lat * 100000) / 100000, lon: Math.round(lon * 100000) / 100000 }
      if (!marker) {
        marker = L.marker([p.lat, p.lon], { icon: pin, draggable: true, keyboard: false }).addTo(map)
        marker.on('dragend', () => {
          const ll = marker!.getLatLng()
          place(ll.lat, ll.lng)
        })
      } else marker.setLatLng([p.lat, p.lon])
      setPoint(p)
    }
    if (start) place(start.lat, start.lon)
    map.on('click', (e: L.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng))
    // the box may still be settling its size when the map starts
    const fix = setTimeout(() => map.invalidateSize(), 150)
    return () => {
      clearTimeout(fix)
      map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="map-picker">
      <p className="field-hint">{t('Zoom in and tap exactly where the greenhouse is. You can drag the pin.')}</p>
      <div ref={box} className="map-box" role="application" aria-label={t('Map')} />
      <div className="map-actions">
        <span className="field-hint">
          {point ? `${formatNumber(point.lat, 5)}, ${formatNumber(point.lon, 5)}` : t('No point chosen yet')}
        </span>
        <button type="button" className="btn btn-ghost btn-small" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button type="button" className="btn btn-primary btn-small" disabled={!point} onClick={() => point && onPick(point)}>
          {t('Use this point')}
        </button>
      </div>
    </div>
  )
}
