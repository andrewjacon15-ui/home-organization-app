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
}

/**
 * The wall display's left rail, which becomes a bottom bar on phones: there, only
 * the `phone` tabs show, plus a More button that opens a sheet with the rest.
 * (Which layout applies is pure CSS; see "Phones" in index.css.)
 */
export function NavRail<T extends string>({ tabs, current, title, onSelect }: Props<T>) {
  const [moreOpen, setMoreOpen] = useState(false)
  const currentTab = tabs.find((t) => t.id === current)
  const onSecondary = !!currentTab && !currentTab.phone

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const select = (t: T) => {
    setMoreOpen(false)
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
          onClick={() => setMoreOpen((o) => !o)}
        >
          <MoreIcon />
          <span>{onSecondary ? currentTab.label : 'More'}</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="more-sheet__backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" role="dialog" aria-label="More sections" onClick={(e) => e.stopPropagation()}>
            <span className="more-sheet__title">{title}</span>
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
          </div>
        </div>
      )}
    </>
  )
}
