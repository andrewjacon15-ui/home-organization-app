import { useId, useState, type KeyboardEvent } from 'react'
import type { CatalogEntry } from '../recipes/catalog'
import { searchRecipes } from './recipeSearch'
import type { PlannedSlot } from './upcomingMeals'

interface Props {
  value: string
  onChange: (text: string) => void
  entries: CatalogEntry[]
  /** Suggests what suits this meal when nothing is typed. */
  slot?: PlannedSlot
  'aria-label': string
  placeholder?: string
}

/**
 * A meal field that searches the recipe book as you type (titles, ingredients, tags) and fills
 * in the one you pick. Anything typed still counts ("Eat out", "Leftovers").
 */
export function RecipePicker({ value, onChange, entries, slot, placeholder = 'Search recipes or type a meal', ...rest }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const results = open ? searchRecipes(entries, value, slot) : []
  const exact = results.length === 1 && results[0].t === value

  const pick = (e: CatalogEntry) => {
    onChange(e.t)
    setOpen(false)
  }
  const onKeyDown = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results.length) return
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setActive((a) => (a + 1) % results.length)
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (ev.key === 'Enter') {
      ev.preventDefault()
      pick(results[active] ?? results[0])
    } else if (ev.key === 'Escape') setOpen(false)
  }

  return (
    <span className="recipe-picker">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open && results.length > 0 && !exact}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-${active}` : undefined}
        placeholder={placeholder}
        maxLength={200}
        aria-label={rest['aria-label']}
      />
      {open && results.length > 0 && !exact && (
        <ul className="recipe-picker__list" id={id} role="listbox" aria-label={`Recipes for ${rest['aria-label']}`}>
          {results.map((e, i) => (
            <li
              key={e.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`recipe-picker__option${i === active ? ' recipe-picker__option--active' : ''}`}
              // Mouse down, not click: the field's blur would close the list first.
              onMouseDown={(ev) => {
                ev.preventDefault()
                pick(e)
              }}
            >
              <span className="recipe-picker__title">
                {e.f ? '★ ' : ''}
                {e.t}
              </span>
              <span className="recipe-picker__meta">{[e.m ? `${e.m} min` : null, ...(e.g?.main ?? []).slice(0, 2)].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
