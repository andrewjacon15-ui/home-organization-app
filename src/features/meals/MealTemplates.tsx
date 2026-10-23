import { useState } from 'react'
import type { GroceryPlan } from '@shared/recipes/groceries.js'
import { AddIcon, CloseIcon, CopyIcon, PencilIcon, TrashIcon } from '../../components/Icons'
import { Select } from '../../components/Select'
import { addDays, fromDateKey } from '../../lib/dates'
import { GroceryReview } from './GroceryReview'
import { PEOPLE_OPTIONS, peopleValue, readPeopleValue } from './people'
import type { Wanted } from './randomize'
import { TemplateEditor } from './TemplateEditor'
import { blankTemplate, isEmptyPlan, type ApplyMode, type MealTemplate, type TemplateDraft } from './templates'

export interface ApplyOptions {
  /** First day of the week it goes on. */
  weekStart: string
  mode: ApplyMode
  people: number | null
  groceries: boolean
}

export interface ApplyResult {
  /** What happened, in a sentence. */
  message: string
  /** The grocery list for the meals it planned, to review before adding (when asked for). */
  groceries?: { plan: GroceryPlan; people: number | null }
}

interface Props {
  /** The week on screen, and this week (templates go on either, or next week). */
  weekStart: string
  currentWeekStart: string
  weekStartsOn: number
  /** The week on screen as a template (to save it), or null when nothing's planned. */
  fromWeek: TemplateDraft | null
  templates: MealTemplate[]
  /** Recipe titles to suggest while typing a meal. */
  titles: string[]
  /** How many the household usually cooks for (Settings → Kitchen). */
  defaultPeople: number | null
  pick: (wanted: Wanted[], taken: string[]) => Promise<Record<string, string>>
  onSave: (draft: TemplateDraft, id?: string) => Promise<void>
  onApply: (t: MealTemplate, opts: ApplyOptions) => Promise<ApplyResult>
  onAddGroceries: (lines: string[]) => Promise<void>
  onDelete: (t: MealTemplate) => void
  onClose: () => void
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const short = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const weekRange = (start: string) => `${short(start)} – ${short(addDays(start, 6))}`

/** "5 dinners, 2 lunches · for 4" */
function summary(t: MealTemplate): string {
  const n = (k: 'breakfast' | 'lunch' | 'dinner') => t.days.filter((d) => d[k]).length
  const parts = [n('dinner') && count(n('dinner'), 'dinner'), n('lunch') && count(n('lunch'), 'lunch', 'lunches'), n('breakfast') && count(n('breakfast'), 'breakfast', 'breakfasts')].filter(Boolean)
  const what = parts.length ? parts.join(', ') : t.days.some((d) => !isEmptyPlan(d)) ? 'Notes only' : 'Empty'
  return t.people ? `${what} · for ${t.people}` : what
}

type View = { kind: 'list' } | { kind: 'edit'; draft: TemplateDraft; id?: string } | { kind: 'review'; message: string; plan: GroceryPlan; people: number | null }

/**
 * Meal plan templates: make one from scratch (typed, picked from the recipe book, or at
 * random) or from a week already planned; change or copy one; and put one on this week or
 * next, with a grocery list for it to look over before anything is added.
 */
export function MealTemplates(p: Props) {
  const [view, setView] = useState<View>({ kind: 'list' })
  const [using, setUsing] = useState<string | null>(null)
  const nextWeek = addDays(p.currentWeekStart, 7)
  const weeks = [
    { start: p.currentWeekStart, label: 'This week' },
    { start: nextWeek, label: 'Next week' },
    ...(p.weekStart !== p.currentWeekStart && p.weekStart !== nextWeek ? [{ start: p.weekStart, label: weekRange(p.weekStart) }] : []),
  ]
  const [week, setWeek] = useState(p.weekStart)
  const [mode, setMode] = useState<ApplyMode>('fill')
  const [people, setPeople] = useState<number | null>(p.defaultPeople)
  const [groceries, setGroceries] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const use = (t: MealTemplate) => {
    setUsing(using === t.id ? null : t.id)
    setPeople(t.people ?? p.defaultPeople)
    setStatus(null)
  }

  async function apply(t: MealTemplate) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const r = await p.onApply(t, { weekStart: week, mode, people, groceries })
      setUsing(null)
      if (r.groceries) setView({ kind: 'review', message: r.message, ...r.groceries })
      else setStatus(r.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Meal plan templates" onClick={p.onClose}>
      <div className="overlay__panel meal-templates" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-button overlay__close" onClick={p.onClose} aria-label="Close">
          <CloseIcon size={22} />
        </button>

        {view.kind === 'edit' && (
          <TemplateEditor
            initial={view.draft}
            editing={!!view.id}
            titles={p.titles}
            weekStartsOn={p.weekStartsOn}
            pick={p.pick}
            onSave={async (draft) => {
              await p.onSave(draft, view.id)
              setStatus(`Saved “${draft.name.trim()}”.`)
              setView({ kind: 'list' })
            }}
            onCancel={() => setView({ kind: 'list' })}
          />
        )}

        {view.kind === 'review' && (
          <>
            <h2>Meal plan templates</h2>
            <p className="meal-groceries__result" role="status">
              {view.message}
            </p>
            <GroceryReview plan={view.plan} people={view.people} onAdd={p.onAddGroceries} onDone={() => setView({ kind: 'list' })} />
          </>
        )}

        {view.kind === 'list' && (
          <>
            <h2>Meal plan templates</h2>
            <div className="row meal-templates__new">
              <button type="button" className="button button--primary" onClick={() => setView({ kind: 'edit', draft: blankTemplate(['dinner'], p.defaultPeople) })}>
                <AddIcon size={18} aria-hidden /> New template
              </button>
              <button
                type="button"
                className="button"
                disabled={!p.fromWeek}
                title={p.fromWeek ? undefined : 'Plan some meals for this week first'}
                onClick={() => p.fromWeek && setView({ kind: 'edit', draft: { ...p.fromWeek, people: p.fromWeek.people ?? p.defaultPeople } })}
              >
                Save {weekRange(p.weekStart)} as a template
              </button>
            </div>

            {p.templates.length === 0 ? (
              <p className="empty">No templates yet. Start one from scratch (the dice fill a week from your recipes), or plan a week you like and save it.</p>
            ) : (
              <ul className="meal-templates__list" aria-label="Templates">
                {p.templates.map((t) => (
                  <li key={t.id}>
                    <div className="meal-templates__row">
                      <span>
                        <strong>{t.name}</strong>
                        <span className="muted"> · {summary(t)}</span>
                      </span>
                      <span className="row">
                        <button type="button" className={`button${using === t.id ? ' button--primary' : ''}`} aria-expanded={using === t.id} onClick={() => use(t)}>
                          Use
                        </button>
                        <button type="button" className="icon-button" aria-label={`Edit template ${t.name}`} onClick={() => setView({ kind: 'edit', draft: { name: t.name, days: t.days, people: t.people, meals: t.meals }, id: t.id })}>
                          <PencilIcon size={18} />
                        </button>
                        <button type="button" className="icon-button" aria-label={`Copy template ${t.name}`} onClick={() => setView({ kind: 'edit', draft: { name: `${t.name} copy`.slice(0, 60), days: t.days, people: t.people, meals: t.meals } })}>
                          <CopyIcon size={18} />
                        </button>
                        <button type="button" className="icon-button" aria-label={`Delete template ${t.name}`} onClick={() => p.onDelete(t)}>
                          <TrashIcon size={18} />
                        </button>
                      </span>
                    </div>
                    {using === t.id && (
                      <div className="meal-templates__use" role="group" aria-label={`Use ${t.name}`}>
                        <div className="segmented segmented--small" role="group" aria-label="Which week">
                          {weeks.map((w) => (
                            <button key={w.start} type="button" className={`segmented__item${week === w.start ? ' segmented__item--active' : ''}`} aria-pressed={week === w.start} onClick={() => setWeek(w.start)}>
                              {w.label}
                            </button>
                          ))}
                        </div>
                        <div className="segmented segmented--small" role="group" aria-label="How">
                          {(
                            [
                              ['fill', 'Fill empty meals'],
                              ['replace', 'Replace the week'],
                            ] as const
                          ).map(([m, label]) => (
                            <button key={m} type="button" className={`segmented__item${mode === m ? ' segmented__item--active' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <label className="field meal-templates__people">
                          Cooking for
                          <Select value={peopleValue(people)} options={PEOPLE_OPTIONS} onChange={(v) => setPeople(readPeopleValue(v))} aria-label="Cooking for" />
                        </label>
                        <label className="meal-templates__check">
                          <input type="checkbox" checked={groceries} onChange={(e) => setGroceries(e.target.checked)} />
                          Make a grocery list for it
                        </label>
                        <button type="button" className="button button--primary" disabled={busy} onClick={() => void apply(t)}>
                          {busy ? 'Planning…' : `Plan ${weekRange(week)}`}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {status && (
              <p className="meal-groceries__result" role="status">
                {status}
              </p>
            )}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
