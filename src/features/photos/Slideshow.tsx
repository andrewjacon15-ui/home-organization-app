import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNow } from '../../lib/hooks'
import { shuffled, type Photo } from './photosApi'

interface Props {
  photos: Photo[]
  seconds: number
  shuffle: boolean
  onExit: () => void
}

const MAX_VIDEO_MS = 60_000
/** The cross-fade in index.css (.slideshow__layer): the drift keeps moving through it. */
const FADE_MS = 1600
/** Each photo drifts a different way, so the slideshow never feels like a loop. */
const DRIFTS = ['in-left', 'in-right', 'out-up', 'in-down'] as const

/**
 * Full-screen slideshow: a slow cross-fade and a gentle drift for photos; muted videos
 * play through (up to a minute). The clock and date stay in one place, bottom left, for
 * every photo. Any tap exits. The next photo is preloaded.
 */
export function Slideshow({ photos, seconds, shuffle, onExit }: Props) {
  const order = useMemo(() => (shuffle ? shuffled(photos) : photos), [photos, shuffle])
  const [index, setIndex] = useState(0)
  const [layer, setLayer] = useState(0) // which of two stacked layers is visible
  // n counts showings, so each photo gets a fresh layer (and drift) every time it appears.
  const [slots, setSlots] = useState<{ photo: Photo; n: number }[]>(order[0] ? [{ photo: order[0], n: 0 }] : [])
  const now = useNow(30_000)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = slots[layer]?.photo ?? null

  const advance = () => {
    if (order.length < 2) return
    const next = (index + 1) % order.length
    const other = layer === 0 ? 1 : 0
    setSlots((s) => {
      const copy = [...s]
      copy[other] = { photo: order[next], n: (s[layer]?.n ?? 0) + 1 }
      return copy
    })
    setLayer(other)
    setIndex(next)
  }

  // Photos advance on a timer; videos advance when they end (or after a minute).
  useEffect(() => {
    if (!current) return
    timer.current = setTimeout(advance, current.kind === 'video' ? MAX_VIDEO_MS : seconds * 1000)
    return () => clearTimeout(timer.current ?? undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, seconds])

  // Preload the photo after this one so the fade never waits on the network.
  useEffect(() => {
    const upcoming = order[(index + 1) % order.length]
    if (upcoming?.kind === 'image') new Image().src = upcoming.url
  }, [order, index])

  // The drift lasts the photo's whole time on screen, fades included, so it never stops mid-way.
  const drift = { '--drift-ms': `${seconds * 1000 + 2 * FADE_MS}ms` } as CSSProperties

  return (
    // Close on click (not pointerdown) so the tap doesn't fall through to a button underneath.
    <div className="slideshow" role="dialog" aria-label="Photo slideshow. Tap to close." onClick={onExit} style={drift}>
      {slots.map(({ photo: p, n }, i) => (
        <div key={`${n}-${p.id}`} className={`slideshow__layer${i === layer ? ' slideshow__layer--on' : ''}`}>
          {p.kind === 'video' ? (
            <video className="slideshow__media" src={p.url} autoPlay={i === layer} muted playsInline onEnded={() => i === layer && advance()} />
          ) : (
            <img className={`slideshow__media slideshow__media--drift slideshow__media--${DRIFTS[n % DRIFTS.length]}`} src={p.url} alt={p.caption || 'Family photo'} />
          )}
        </div>
      ))}
      <div className="slideshow__overlay" aria-hidden>
        <span className="slideshow__clock">
          <span className="slideshow__time">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="slideshow__date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </span>
        {current?.caption && <span className="slideshow__caption">{current.caption}</span>}
      </div>
    </div>
  )
}
