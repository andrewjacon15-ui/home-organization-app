import { useState, type CSSProperties, type FormEvent } from 'react'
import { RandomIcon } from '../../components/Icons'
import { Select } from '../../components/Select'
import type { MealPlan } from '../../types'
import { PEOPLE_OPTIONS, peopleValue, readPeopleValue } from './people'
import type { Wanted } from './randomize'
import type { TemplateDraft } from './templates'
import { SLOT_LABELS, type PlannedSlot } from './upcomingMeals'

const SLOTS: PlannedSlot[] = ['breakfast', 'lunch', 'dinner']
/** A Sunday, for weekday names in the reader's language. */
const SUNDAY = new Date(2026, 9, 4)
const weekday = (i: number) => new Date(SUNDAY.getFullYear(), SUNDAY.getMonth(), SUNDAY.getDate() + i).toLocaleDateString(undefined, { weekday: 'long' })

interface Props {
  initial: TemplateDraft
  /** Editing a saved template (vs a new one). */
  editing: boolean
  /** Recipe titles to suggest while typing a meal. */
  titles: string[]
  /** First day of the week (0 = Sunday), so the rows read like the planner. */
  weekStartsOn: number
  /** Picks recipes for these meals (by weekday "0"–"6"), never ones in `taken`. */
  pick: (wanted: Wanted[], taken: string[]) => Promise<Record<string, string>>
  onSave: (draft: TemplateDraft) => Promise<void>
  onCancel: () => void
}

/**
 * Makes or changes a meal plan template: a name, how many it's for, which meals, then a meal
 * for each day, typed, chosen from the recipe book, or picked at random (one at a time or every
 * empty one at once).
 */
export function TemplateEditor({ initial, editing, titles, weekStartsOn, pick, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<TemplateDraft>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const order = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7)
  const meals = SLOTS.filter((s) => draft.meals.includes(s))
  const titlesIn = (days: MealPlan[]) => days.flatMap((d) => meals.map((s) => d[s])).filter(Boolean)
  const empty = order.flatMap((d) => meals.filter((s) => !draft.days[d][s]).map((slot) => ({ day: String(d), slot })))

  const setMeal = (day: number, slot: PlannedSlot, text: string) =>
    setDraft((cur) => ({ ...cur, days: cur.days.map((p, i) => (i === day ? { ...p, [slot]: text } : p)) }))
  const toggleMeal = (slot: PlannedSlot) =>
    setDraft((cur) => {
      const on = cur.meals.includes(slot)
      // Always at least one meal.
      if (on && cur.meals.length === 1) return cur
      return { ...cur, meals: SLOTS.filter((s) => (s === slot ? !on : cur.meals.includes(s))) }
    })

  async function randomize(wanted: Wanted[]) {
    if (!wanted.length) return
    setError(null)
    setBusy(true)
    try {
      // Re-rolling a meal shouldn't hand back the same one.
      const keep = draft.days.map((d, i) => (wanted.some((w) => w.day === String(i)) ? { ...d, ...Object.fromEntries(wanted.filter((w) => w.day === String(i)).map((w) => [w.slot, ''])) } : d))
      const taken = [...titlesIn(keep), ...wanted.map((w) => draft.days[Number(w.day)][w.slot]).filter(Boolean)]
      const picked = await pick(wanted, taken)
      if (!Object.keys(picked).length) setError(titles.length ? 'No more recipes to choose from for that meal.' : 'Add some recipes in Recipes first, then the randomizer can choose from them.')
      setDraft((cur) => ({ ...cur, days: cur.days.map((p, i) => ({ ...p, ...Object.fromEntries(SLOTS.flatMap((s) => (picked[`${i}:${s}`] ? [[s, picked[`${i}:${s}`]]] : []))) })) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return setError('Give the template a name, like “School week”.')
    setBusy(true)
    setError(null)
    try {
      await onSave(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="template-editor" onSubmit={save} aria-label={editing ? `Edit ${initial.name}` : 'New template'}>
      <h2>{editing ? 'Edit template' : 'New template'}</h2>
      <div className="template-editor__basics">
        <label className="field">
          Name
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="School week" maxLength={60} autoFocus={!editing} />
        </label>
        <label className="field">
          Cooking for
          <Select value={peopleValue(draft.people)} options={PEOPLE_OPTIONS} onChange={(v) => setDraft({ ...draft, people: readPeopleValue(v) })} aria-label="Cooking for" />
        </label>
      </div>
      <div className="template-editor__meals">
        <span className="meal__label">Meals</span>
        <div className="segmented segmented--small" role="group" aria-label="Meals in this template">
          {SLOTS.map((s) => (
            <button key={s} type="button" className={`segmented__item${draft.meals.includes(s) ? ' segmented__item--active' : ''}`} aria-pressed={draft.meals.includes(s)} onClick={() => toggleMeal(s)}>
              {SLOT_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="row template-editor__tools">
        <button type="button" className="button" disabled={busy || empty.length === 0} onClick={() => void randomize(empty)}>
          <RandomIcon size={18} aria-hidden /> Randomize empty meals
        </button>
        <button type="button" className="link" disabled={busy} onClick={() => setDraft({ ...draft, days: draft.days.map((d) => ({ ...d, breakfast: '', lunch: '', dinner: '' })) })}>
          Clear all
        </button>
      </div>

      {titles.length > 0 && (
        <datalist id="template-titles">
          {titles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      <ol className="template-editor__days" style={{ '--meals': meals.length } as CSSProperties}>
        {order.map((d) => (
          <li key={d} className="template-editor__day">
            <span className="template-editor__weekday">{weekday(d)}</span>
            {meals.map((s) => {
              const label = `${weekday(d)} ${SLOT_LABELS[s].toLowerCase()}`
              return (
                <span key={s} className="template-editor__cell">
                  {meals.length > 1 && <span className="template-editor__slot">{SLOT_LABELS[s]}</span>}
                  <span className="template-editor__field">
                    <input value={draft.days[d][s]} onChange={(e) => setMeal(d, s, e.target.value)} list="template-titles" aria-label={label} placeholder="Recipe or meal" maxLength={200} />
                    <button type="button" className="icon-button" aria-label={`Randomize ${label}`} title="Pick a recipe at random" disabled={busy} onClick={() => void randomize([{ day: String(d), slot: s }])}>
                      <RandomIcon size={18} />
                    </button>
                  </span>
                </span>
              )
            })}
          </li>
        ))}
      </ol>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row template-editor__actions">
        <button className="button button--primary" disabled={busy}>
          {editing ? 'Save changes' : 'Save template'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
