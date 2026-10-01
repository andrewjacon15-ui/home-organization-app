import type { CSSProperties } from 'react'
import { encodeView, type PeopleView } from '../lib/peopleView'
import type { Member } from '../types'

interface Props {
  members: Member[]
  userId: string
  value: PeopleView
  onChange: (view: PeopleView) => void
  /** e.g. "Show lists for" */
  label: string
}

/** Everyone · Me · each other person, as a segmented control. */
export function PeopleFilter({ members, userId, value, onChange, label }: Props) {
  const current = encodeView(value)
  const options: { view: PeopleView; text: string; color?: string }[] = [
    { view: 'everyone', text: 'Everyone' },
    { view: 'me', text: 'Me', color: members.find((m) => m.id === userId)?.color },
    ...members.filter((m) => m.id !== userId).map((m) => ({ view: { member: m.id } as PeopleView, text: m.displayName.split(' ')[0], color: m.color })),
  ]
  // Only one person in the family: nothing to filter.
  if (members.length < 2) return null
  return (
    <div className="people-filter segmented" role="group" aria-label={label}>
      {options.map((o) => {
        const id = encodeView(o.view)
        return (
          <button
            key={id}
            type="button"
            className={`segmented__item${id === current ? ' segmented__item--active' : ''}`}
            aria-pressed={id === current}
            onClick={() => onChange(o.view)}
          >
            {o.color && <span className="people-filter__dot" style={{ '--pill': o.color } as CSSProperties} aria-hidden />}
            {o.text}
          </button>
        )
      })}
    </div>
  )
}
