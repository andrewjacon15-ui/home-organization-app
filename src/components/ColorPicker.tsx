import { useId, useState, type CSSProperties } from 'react'
import { normalizeHex, PERSON_COLORS } from '../lib/colors'

interface Props {
  label: string
  value: string
  onChange: (hex: string) => void
}

/** Twelve presets plus a custom color (native picker + hex field). */
export function ColorPicker({ label, value, onChange }: Props) {
  const id = useId()
  const [hex, setHex] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setHex(value)
  }
  const current = value.toLowerCase()
  const isPreset = PERSON_COLORS.some((c) => c.hex.toLowerCase() === current)

  const commitHex = () => {
    const v = normalizeHex(hex)
    if (v && v !== current) onChange(v)
    else setHex(value)
  }

  return (
    <div className="color-picker">
      <div className="swatches" role="radiogroup" aria-label={label}>
        {PERSON_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            role="radio"
            aria-checked={current === c.hex.toLowerCase()}
            aria-label={c.name}
            title={c.name}
            className={`swatch${current === c.hex.toLowerCase() ? ' swatch--active' : ''}`}
            style={{ '--pill': c.hex } as CSSProperties}
            onClick={() => onChange(c.hex.toLowerCase())}
          />
        ))}
      </div>
      <div className="color-picker__custom">
        <input
          type="color"
          aria-label={`${label}: custom`}
          value={normalizeHex(value) ?? '#000000'}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className={`color-picker__native${isPreset ? '' : ' color-picker__native--active'}`}
        />
        <label htmlFor={id} className="visually-hidden">
          {label} hex code
        </label>
        <input
          id={id}
          className="color-picker__hex"
          value={hex}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => setHex(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </div>
    </div>
  )
}
