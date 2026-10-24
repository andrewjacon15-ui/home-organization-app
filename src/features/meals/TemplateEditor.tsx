import { useState, type CSSProperties, type FormEvent } from 'react'
import { RandomIcon } from '../../components/Icons'
import { Select } from '../../components/Select'
import type { MealPlan } from '../../types'
import type { CatalogEntry } from '../recipes/catalog'
import { PEOPLE_OPTIONS, peopleValue, readPeopleValue } from './people'
import type { Wanted } from './randomize'
import { RecipePicker } from './RecipePicker'
import type { MealTemplate, TemplateDraft } from './templates'
import { SLOT_LABELS, type PlannedSlot } from './upcomingMeals'

const SLOTS: PlannedSlot[] = ['breakfast', 'lunch', 'dinner']
/** A Sunday, for weekday names in the reader's language. */
const SUNDAY = new Date(2026, 9, 4)
const weekday = (i: number) => new Date(SUNDAY.getFullYear(), SUNDAY.getMonth(), SUNDAY.getDate() + i).toLocaleDateString(undefined, { weekday: 'long' })
const WEEKDAYS = [1, 2, 3, 4, 5]

interface Props {
  initial: TemplateDraft
  /** Editing a saved template (vs a new one). */
  editing: boolean
  /** The recipe book, to search while filling in meals. */
  entries: CatalogEntry[]
  /** Day templates, to fill a week's days from. */
  dayTemplates: MealTemplate[]
  /** First day of the week (0 = Sunday), so the rows read like the planner. */
  weekStartsOn: number
  /** Picks recipes for these meals (by row, "0"–"6"), never ones in `taken`. */
  pick: (wanted: Wanted[], taken: string[]) => Promise<Record<string, string>>
  onSave: (draft: TemplateDraft) => Promise<void>
  onCancel: () => void
}

/**
 * Makes or changes a meal plan template, a week or a single day: a name, how many it's for,
 * which meals, then each meal searched from the recipe book, typed, or picked at random. A
 * week's days can be filled from day templates, one day or Monday to Friday at once.
 */
export function TemplateEditor({ initial, editing, entries, dayTemplates, weekStartsOn, pick, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<TemplateDraft>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const day = draft.kind === 'day'
  const order = day ? [0] : Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7)
  const meals = SLOTS.filter((s) => draft.meals.includes(s))
  const titlesIn = (days: MealPlan[]) => days.flatMap((d) => meals.map((s) => d[s])).filter(Boolean)
  const empty = order.flatMap((d) => meals.filter((s) => !draft.days[d][s]).map((slot) => ({ day: String(d), slot })))
  const rowName = (d: number) => (day ? 'The day' : weekday(d))

  const setMeal = (row: number, slot: PlannedSlot, text: string) =>
    setDraft((cur) => ({ ...cur, days: cur.days.map((p, i) => (i === row ? { ...p, [slot]: text } : p)) }))
  const toggleMeal = (slot: PlannedSlot) =>
    setDraft((cur) => {
      const on = cur.meals.includes(slot)
      // Always at least one meal.
      if (on && cur.meals.length === 1) return cur
      return { ...cur, meals: SLOTS.filter((s) => (s === slot ? !on : cur.meals.includes(s))) }
    })
  /** Copies a day template's meals onto these weekdays, turning on any meal it has. */
  const fillFrom = (id: string, rows: number[]) => {
    const t = dayTemplates.find((x) => x.id === id)
    if (!t) return
    const from = t.days[0]
    setDraft((cur) => ({
      ...cur,
      meals: SLOTS.filter((s) => cur.meals.includes(s) || from[s]),
      days: cur.days.map((p, i) => (rows.includes(i) ? { ...p, ...Object.fromEntries(SLOTS.filter((s) => from[s]).map((s) => [s, from[s]])), notes: p.notes || from.notes } : p)),
    }))
  }

  async function randomize(wanted: Wanted[]) {
    if (!wanted.length) return
    setError(null)
    setBusy(true)
    try {
      // Re-rolling a meal shouldn't hand back the same one.
      const keep = draft.days.map((d, i) => (wanted.some((w) => w.day === String(i)) ? { ...d, ...Object.fromEntries(wanted.filter((w) => w.day === String(i)).map((w) => [w.slot, ''])) } : d))
      const taken = [...titlesIn(keep), ...wanted.map((w) => draft.days[Number(w.day)][w.slot]).filter(Boolean)]
      const picked = await pick(wanted, taken)
      if (!Object.keys(picked).length) setError(entries.length ? 'No more recipes to choose from for that meal.' : 'Add some recipes in Recipes first, then the randomizer can choose from them.')
      setDraft((cur) => ({ ...cur, days: cur.days.map((p, i) => ({ ...p, ...Object.fromEntries(SLOTS.flatMap((s) => (picked[`${i}:${s}`] ? [[s, picked[`${i}:${s}`]]] : []))) })) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return setError(day ? 'Give the day a name, like “Taco Tuesday”.' : 'Give the template a name, like “School week”.')
    setBusy(true)
    setError(null)
    try {
      await onSave(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const dayOptions = [{ value: '', label: 'Fill from a day template…' }, ...dayTemplates.map((t) => ({ value: t.id, label: t.name }))]

  return (
    <form className="template-editor" onSubmit={save} aria-label={editing ? `Edit ${initial.name}` : day ? 'New day template' : 'New week template'}>
      <h2>{editing ? 'Edit template' : day ? 'New day template' : 'New week template'}</h2>
      <div className="template-editor__basics">
        <label className="field">
          Name
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={day ? 'Taco Tuesday' : 'School week'} maxLength={60} autoFocus={!editing} />
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
        {!day && dayTemplates.length > 0 && (
          <Select value="" options={[{ value: '', label: 'Fill Mon–Fri from…' }, ...dayTemplates.map((t) => ({ value: t.id, label: t.name }))]} onChange={(v) => fillFrom(v, WEEKDAYS)} aria-label="Fill Monday to Friday from a day template" />
        )}
        <button type="button" className="link" disabled={busy} onClick={() => setDraft({ ...draft, days: draft.days.map((d) => ({ ...d, breakfast: '', lunch: '', dinner: '' })) })}>
          Clear all
        </button>
      </div>

      <ol className="template-editor__days" style={{ '--meals': meals.length } as CSSProperties}>
        {order.map((d) => (
          <li key={d} className="template-editor__day">
            <span className="template-editor__weekday">
              {rowName(d)}
              {!day && dayTemplates.length > 0 && (
                <Select value="" options={dayOptions} onChange={(v) => fillFrom(v, [d])} aria-label={`Fill ${weekday(d)} from a day template`} className="template-editor__from" />
              )}
            </span>
            {meals.map((s) => {
              const label = `${rowName(d)} ${SLOT_LABELS[s].toLowerCase()}`
              return (
                <span key={s} className="template-editor__cell">
                  {meals.length > 1 && <span className="template-editor__slot">{SLOT_LABELS[s]}</span>}
                  <span className="template-editor__field">
                    <RecipePicker value={draft.days[d][s]} onChange={(text) => setMeal(d, s, text)} entries={entries} slot={s} aria-label={label} />
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
