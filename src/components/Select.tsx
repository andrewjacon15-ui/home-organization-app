import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDownIcon, DoneIcon } from './Icons'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  /** Pairs with a <label htmlFor>. */
  id?: string
  'aria-label'?: string
  disabled?: boolean
  className?: string
}

/**
 * A dropdown drawn by the app instead of the system. Android draws a native <select> list
 * in its own colors; this one uses the family's highlight color everywhere, at the same
 * size on the tablet, phones, and computers. Keyboard: arrows, Home/End, Enter, Escape,
 * and typing a letter jumps to the option that starts with it.
 */
export function Select({ value, options, onChange, id, disabled, className, ...rest }: Props) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [upward, setUpward] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const current = options.find((o) => o.value === value)

  const show = () => {
    if (disabled) return
    const r = button.current?.getBoundingClientRect()
    // Open upward when there isn't room below (a row near the bottom of the screen).
    setUpward(!!r && window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom)
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }
  const choose = (i: number) => {
    const o = options[i]
    if (o && o.value !== value) onChange(o.value)
    close()
  }

  // A tap anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])

  const onKey = (e: KeyboardEvent) => {
    const last = options.length - 1
    const move = (i: number) => {
      e.preventDefault()
      if (!open) show()
      else setActive(Math.max(0, Math.min(last, i)))
    }
    if (e.key === 'ArrowDown') move(active + 1)
    else if (e.key === 'ArrowUp') move(active - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(last)
    else if (e.key === 'Escape' && open) {
      e.preventDefault()
      close()
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Tab' && open) close(false)
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()))
      if (i >= 0) {
        if (open) setActive(i)
        else if (options[i].value !== value) onChange(options[i].value)
      }
    }
  }

  return (
    <div className={`select${open ? ' select--open' : ''}${className ? ` ${className}` : ''}`} ref={wrap}>
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={rest['aria-label']}
        className="select__button"
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        <span className="select__value">{current?.label ?? ''}</span>
        <ChevronDownIcon size={18} className="select__chevron" />
      </button>
      {open && (
        <ul ref={list} id={listId} role="listbox" aria-label={rest['aria-label']} className={`select__list${upward ? ' select__list--up' : ''}`}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              data-value={o.value}
              className={`select__option${i === active ? ' select__option--active' : ''}`}
              onPointerEnter={() => setActive(i)}
              onClick={(e) => {
                // Inside a <label>, a click would otherwise be passed on to the button and reopen the list.
                e.preventDefault()
                choose(i)
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <DoneIcon size={18} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
