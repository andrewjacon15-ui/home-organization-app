import { useId, useState, type ReactNode } from 'react'

export function SettingsSection({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="settings-section" aria-label={title} id={id}>
      <h2>{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  )
}

export function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className="setting-row">
      <label htmlFor={id} className="setting-row__label">
        {label}
        {hint && <span className="setting-row__hint">{hint}</span>}
      </label>
      <input id={id} type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  )
}

export function SelectRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="setting-row">
      <label htmlFor={id} className="setting-row__label">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value)
          if (picked) onChange(picked.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** A text field that saves when you leave it (or press Enter), not on every keystroke. */
export function TextRow({ label, value, placeholder, maxLength, onSave }: { label: string; value: string; placeholder?: string; maxLength?: number; onSave: (v: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  const commit = () => {
    const v = draft.trim()
    if (v !== value) onSave(v)
  }
  return (
    <div className="setting-row">
      <label htmlFor={id} className="setting-row__label">
        {label}
      </label>
      <input
        id={id}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </div>
  )
}
