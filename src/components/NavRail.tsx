import { useEffect, useState, type ReactElement, type SVGProps } from 'react'
import { MoreIcon } from './Icons'

export interface NavTab<T extends string> {
  id: T
  label: string
  Icon: (p: SVGProps<SVGSVGElement>) => ReactElement
  /** Shown in the phone's bottom bar; the rest live under More. */
  phone?: boolean
}

interface Props<T extends string> {
  tabs: NavTab<T>[]
  current: T
  /** Family or calendar name: the rail's monogram and the More sheet's heading. */
  title: string
  onSelect: (tab: T) => void
  /** Lets a phone choose its bottom bar: called with the sections to pin, in order (null = the usual ones). */
  onPin?: (pins: T[] | null) => void
  /** How many sections the bottom bar holds beside More. */
  barSize?: number
}

/**
 * The wall display's left rail, which becomes a bottom bar on phones: there, only
 * the `phone` tabs show, plus a More button that opens a sheet with the rest.
 * (Which layout applies is pure CSS; see "Phones" in index.css.)
 */
export function NavRail<T extends string>({ tabs, current, title, onSelect, onPin, barSize = 4 }: Props<T>) {
  const [moreOpen, setMoreOpen] = useState(false)
  // Choosing the bottom bar: the sections picked so far, in order (null = not choosing).
  const [picking, setPicking] = useState<T[] | null>(null)
  const closeMore = () => {
    setMoreOpen(false)
    setPicking(null)
  }
  const pick = (id: T) => {
    if (!picking) return
    const next = picking.includes(id) ? picking.filter((x) => x !== id) : picking.length < barSize ? [...picking, id] : picking
    if (next === picking) return
    setPicking(next)
    if (next.length) onPin?.(next)
  }
  const currentTab = tabs.find((t) => t.id === current)
  const onSecondary = !!currentTab && !currentTab.phone

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMoreOpen(false)
      setPicking(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const select = (t: T) => {
    closeMore()
    onSelect(t)
  }

  return (
    <>
      <nav className="rail" aria-label="Sections">
        <span className="rail__mark" aria-hidden>
          {title.replace(/^the\s+/i, '').charAt(0)}
        </span>
        {tabs.map(({ id, label, Icon, phone }) => (
          <button
            key={id}
            type="button"
            className={`rail__item${phone ? '' : ' rail__item--secondary'}${current === id && !moreOpen ? ' rail__item--active' : ''}`}
            aria-current={current === id ? 'page' : undefined}
            onClick={() => select(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`rail__item rail__more${onSecondary || moreOpen ? ' rail__item--active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => (moreOpen ? closeMore() : setMoreOpen(true))}
        >
          <MoreIcon />
          <span>{onSecondary ? currentTab.label : 'More'}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="more-sheet__backdrop" onClick={closeMore}>
          <div className="more-sheet" role="dialog" aria-label={picking ? 'Choose the bottom bar' : 'More sections'} onClick={(e) => e.stopPropagation()}>
            <div className="more-sheet__head">
              <span className="more-sheet__title">{picking ? 'Bottom bar' : title}</span>
              {onPin &&
                (picking ? (
                  <button type="button" className="button button--primary" onClick={() => setPicking(null)}>
                    Done
                  </button>
                ) : (
                  <button type="button" className="link" onClick={() => setPicking(tabs.filter((t) => t.phone).map((t) => t.id))}>
                    Edit bar
                  </button>
                ))}
            </div>
            {picking ? (
              <>
                <p className="more-sheet__hint">
                  Tap up to {barSize} sections to keep in the bottom bar on this phone, in the order you want them. {picking.length} of {barSize} chosen.
                </p>
                <div className="more-sheet__grid">
                  {tabs.map(({ id, label, Icon }) => {
                    const at = picking.indexOf(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`more-sheet__item more-sheet__item--pick${at >= 0 ? ' more-sheet__item--active' : ''}`}
                        aria-pressed={at >= 0}
                        aria-label={at >= 0 ? `${label}: in the bottom bar, position ${at + 1}` : `${label}: not in the bottom bar`}
                        disabled={at < 0 && picking.length >= barSize}
                        onClick={() => pick(id)}
                      >
                        {at >= 0 && (
                          <span className="more-sheet__badge" aria-hidden>
                            {at + 1}
                          </span>
                        )}
                        <Icon />
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  className="link more-sheet__reset"
                  onClick={() => {
                    onPin?.(null)
                    setPicking(null)
                  }}
                >
                  Use the usual sections
                </button>
              </>
            ) : (
              <div className="more-sheet__grid">
                {tabs
                  .filter((t) => !t.phone)
                  .map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={`more-sheet__item${current === id ? ' more-sheet__item--active' : ''}`}
                      aria-current={current === id ? 'page' : undefined}
                      onClick={() => select(id)}
                    >
                      <Icon />
                      <span>{label}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
