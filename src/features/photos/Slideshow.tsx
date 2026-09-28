import { useEffect, useMemo, useRef, useState } from 'react'
import { useNow } from '../../lib/hooks'
import { shuffled, type Photo } from './photosApi'

interface Props {
  photos: Photo[]
  seconds: number
  shuffle: boolean
  onExit: () => void
}

const MAX_VIDEO_MS = 60_000

/**
 * Full-screen slideshow: slow cross-fade and drift for photos, muted videos play
 * through (up to a minute). Any tap exits. The next photo is preloaded.
 */
export function Slideshow({ photos, seconds, shuffle, onExit }: Props) {
  const order = useMemo(() => (shuffle ? shuffled(photos) : photos), [photos, shuffle])
  const [index, setIndex] = useState(0)
  const [layer, setLayer] = useState(0) // which of two stacked layers is visible
  const [slots, setSlots] = useState<(Photo | null)[]>([order[0] ?? null, null])
  const now = useNow(30_000)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = slots[layer]

  const advance = () => {
    if (order.length < 2) return
    const next = (index + 1) % order.length
    const other = layer === 0 ? 1 : 0
    setSlots((s) => {
      const copy = [...s]
      copy[other] = order[next]
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

  return (
    // Close on click (not pointerdown) so the tap doesn't fall through to a button underneath.
    <div className="slideshow" role="dialog" aria-label="Photo slideshow. Tap to close." onClick={onExit}>
      {slots.map((p, i) =>
        p ? (
          <div key={`${i}-${p.id}`} className={`slideshow__layer${i === layer ? ' slideshow__layer--on' : ''}`}>
            {p.kind === 'video' ? (
              <video className="slideshow__media" src={p.url} autoPlay={i === layer} muted playsInline onEnded={() => i === layer && advance()} />
            ) : (
              <img className="slideshow__media slideshow__media--drift" src={p.url} alt={p.caption || 'Family photo'} />
            )}
          </div>
        ) : null,
      )}
      <div className="slideshow__overlay" aria-hidden>
        <span className="slideshow__time">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
        <span className="slideshow__date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        {current?.caption && <span className="slideshow__caption">{current.caption}</span>}
      </div>
    </div>
  )
}
