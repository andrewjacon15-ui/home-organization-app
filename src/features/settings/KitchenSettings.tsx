import { useEffect, useState, type FormEvent } from 'react'
import { DEFAULT_KITCHEN, DEFAULT_SITES, normalizeSite, type KitchenSettings as Kitchen } from '@shared/recipes/kitchen.js'
import { DEFAULT_STAPLES, PRIORITY_LABELS, SEARCH_PRIORITIES } from '@shared/recipes/matcher.js'
import { CloseIcon } from '../../components/Icons'
import { PEOPLE_OPTIONS, peopleValue, readPeopleValue } from '../meals/people'
import { saveKitchen, watchKitchen } from '../recipes/kitchenApi'
import { SelectRow, SettingsSection } from './SettingRows'

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
              <CloseIcon size={14} />
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
      <p className="settings-note">Used by “What can I make?” in Recipes and by meal planning in Meals.</p>
      <SelectRow label="Usually cooking for" value={peopleValue(kitchen.people)} options={PEOPLE_OPTIONS} onChange={(v) => save({ ...kitchen, people: readPeopleValue(v) })} />
      <p className="settings-note">Grocery lists from the meal plan scale each recipe to this many. A template can say its own number.</p>
      <ChipList label="Never pick recipes with" items={kitchen.avoid} onChange={(avoid) => save({ ...kitchen, avoid })} normalize={ingredientName} placeholder="e.g. peanuts" resetTo={[]} />
      <p className="settings-note">Allergies and dislikes: “Randomize” in Meals skips any recipe that uses these.</p>
      <ChipList label="Pantry staples" items={kitchen.staples} onChange={(staples) => save({ ...kitchen, staples })} normalize={ingredientName} placeholder="e.g. butter" resetTo={DEFAULT_STAPLES} />
      <p className="settings-note">Staples are things you always have; recipes aren't marked down for needing them.</p>
      <ChipList label="Recipe sites for online search" items={kitchen.sites} onChange={(sites) => save({ ...kitchen, sites })} normalize={normalizeSite} placeholder="e.g. thekitchn.com" resetTo={DEFAULT_SITES} />
      <SelectRow
        label="Sort search results by"
        value={kitchen.searchPriority}
        options={SEARCH_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
        onChange={(searchPriority) => save({ ...kitchen, searchPriority })}
      />
      <p className="settings-note">Best match favors recipes that use what you have; Best rated favors what lots of cooks rated highly. You can switch above any results without searching again.</p>
      <p className="settings-note">Online search looks only at these sites, reads each page politely (it follows each site's rules for automated tools), and never saves a recipe until you choose one.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </SettingsSection>
  )
}
