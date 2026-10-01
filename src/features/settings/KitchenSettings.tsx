import { X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { DEFAULT_KITCHEN, DEFAULT_SITES, normalizeSite, type KitchenSettings as Kitchen } from '@shared/recipes/kitchen.js'
import { DEFAULT_STAPLES } from '@shared/recipes/matcher.js'
import { ICON_STROKE } from '../../components/Icons'
import { saveKitchen, watchKitchen } from '../recipes/kitchenApi'
import { SettingsSection } from './SettingRows'

/** Editable chip list: remove with ✕, add with the field. */
export function ChipList({ label, items, onChange, normalize, placeholder, resetTo }: { label: string; items: string[]; onChange: (next: string[]) => void; normalize: (s: string) => string | null; placeholder: string; resetTo: string[] }) {
  const [draft, setDraft] = useState('')
  const [bad, setBad] = useState(false)
  function add(e: FormEvent) {
    e.preventDefault()
    const v = normalize(draft)
    if (!v) return setBad(true)
    if (!items.includes(v)) onChange([...items, v])
    setDraft('')
    setBad(false)
  }
  return (
    <div className="setting-row setting-row--stacked">
      <span className="setting-row__label">{label}</span>
      <ul className="chip-list" aria-label={label}>
        {items.map((it) => (
          <li key={it} className="tag chip-list__item">
            {it}
            <button type="button" className="chip-list__remove" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))}>
              <X size={14} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={add}>
        <input value={draft} onChange={(e) => (setDraft(e.target.value), setBad(false))} placeholder={placeholder} aria-label={`Add to ${label.toLowerCase()}`} aria-invalid={bad} maxLength={100} />
        <button className="button">Add</button>
        <button type="button" className="link" onClick={() => onChange(resetTo)}>
          Reset
        </button>
      </form>
      {bad && <span className="error">That doesn't look right.</span>}
    </div>
  )
}

const ingredientName = (s: string) => {
  const v = s.trim().toLowerCase()
  return v && v.length <= 40 ? v : null
}

export function KitchenSettings({ familyId }: { familyId: string }) {
  const [kitchen, setKitchen] = useState<Kitchen>(DEFAULT_KITCHEN)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => watchKitchen(familyId, setKitchen), [familyId])
  const save = (next: Kitchen) => {
    setKitchen(next)
    saveKitchen(familyId, next).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }
  return (
    <SettingsSection title="Kitchen" id="kitchen">
      <p className="settings-note">Used by “What can I make?” in Recipes.</p>
      <ChipList label="Pantry staples" items={kitchen.staples} onChange={(staples) => save({ ...kitchen, staples })} normalize={ingredientName} placeholder="e.g. butter" resetTo={DEFAULT_STAPLES} />
      <p className="settings-note">Staples are things you always have; recipes aren't marked down for needing them.</p>
      <ChipList label="Recipe sites for online search" items={kitchen.sites} onChange={(sites) => save({ ...kitchen, sites })} normalize={normalizeSite} placeholder="e.g. thekitchn.com" resetTo={DEFAULT_SITES} />
      <p className="settings-note">Online search looks only at these sites, reads each page politely (it follows each site's rules for automated tools), and never saves a recipe until you choose one.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </SettingsSection>
  )
}
