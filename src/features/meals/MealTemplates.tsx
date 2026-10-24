import { useState } from 'react'
import { AddIcon, CloseIcon, CopyIcon, PencilIcon, TrashIcon } from '../../components/Icons'
import { Select } from '../../components/Select'
import { addDays, fromDateKey } from '../../lib/dates'
import type { MealPlan } from '../../types'
import type { NewItem } from '../lists/listsApi'
import { GroceryReview } from './GroceryReview'
import type { Shopping } from './shopping'
import { PEOPLE_OPTIONS, peopleValue, readPeopleValue } from './people'
import type { Wanted } from './randomize'
import { STARTER_TEMPLATES } from './starters'
import { TemplateEditor } from './TemplateEditor'
import type { CatalogEntry } from '../recipes/catalog'
import { blankTemplate, isDay, isEmptyPlan, templateMealsOn, type ApplyMode, type MealTemplate, type TemplateDraft } from './templates'

export interface ApplyOptions {
  /** First day of the week it goes on (a day template: the day itself). */
  weekStart: string
  mode: ApplyMode
  people: number | null
  groceries: boolean
}

export interface ApplyResult {
  /** What happened, in a sentence. */
  message: string
  /** The grocery list for the meals it planned, to review before adding (when asked for). */
  groceries?: { shopping: Shopping; people: number | null }
}

interface Props {
  /** The week on screen, and this week (templates go on either, or next week). */
  weekStart: string
  currentWeekStart: string
  weekStartsOn: number
  /** What's planned for the week on screen (to tell which templates are on it). */
  weekPlans: Record<string, MealPlan>
  /** Takes a template's meals back off the week on screen (and their groceries); resolves with what happened. */
  onRemoveFromWeek: (t: MealTemplate) => Promise<string>
  /** The week on screen as a template (to save it), or null when nothing's planned. */
  fromWeek: TemplateDraft | null
  templates: MealTemplate[]
  /** The recipe book, to search while filling in a template. */
  entries: CatalogEntry[]
  /** Today, for the days a day template can go on. */
  today: string
  /** How many the household usually cooks for (Settings → Kitchen). */
  defaultPeople: number | null
  pick: (wanted: Wanted[], taken: string[]) => Promise<Record<string, string>>
  onSave: (draft: TemplateDraft, id?: string) => Promise<void>
  onApply: (t: MealTemplate, opts: ApplyOptions) => Promise<ApplyResult>
  onAddGroceries: (lines: NewItem[]) => Promise<void>
  onDelete: (t: MealTemplate) => void
  onClose: () => void
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const short = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const weekRange = (start: string) => `${short(start)} – ${short(addDays(start, 6))}`

/** "5 dinners, 2 lunches · for 4" */
function summary(t: Pick<MealTemplate, 'days' | 'people'>): string {
  const n = (k: 'breakfast' | 'lunch' | 'dinner') => t.days.filter((d) => d[k]).length
  const parts = [n('dinner') && count(n('dinner'), 'dinner'), n('lunch') && count(n('lunch'), 'lunch', 'lunches'), n('breakfast') && count(n('breakfast'), 'breakfast', 'breakfasts')].filter(Boolean)
  const what = parts.length ? parts.join(', ') : t.days.some((d) => !isEmptyPlan(d)) ? 'Notes only' : 'Empty'
  return t.people ? `${what} · for ${t.people}` : what
}

type View = { kind: 'list' } | { kind: 'edit'; draft: TemplateDraft; id?: string } | { kind: 'review'; message: string; shopping: Shopping; people: number | null }

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
  // A day template goes on one of the next two weeks' days.
  const [day, setDay] = useState(p.today)
  const nextDays = Array.from({ length: 14 }, (_, i) => addDays(p.today, i))
  const dayLabel = (d: string) => (d === p.today ? 'Today' : d === addDays(p.today, 1) ? 'Tomorrow' : fromDateKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))
  const weekTemplates = p.templates.filter((t) => !isDay(t))
  const dayTemplates = p.templates.filter(isDay)
  const [mode, setMode] = useState<ApplyMode>('fill')
  const [people, setPeople] = useState<number | null>(p.defaultPeople)
  const [groceries, setGroceries] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Starters the household hasn't added yet (by name).
  const have = new Set(p.templates.map((t) => t.name.trim().toLowerCase()))
  const starters = STARTER_TEMPLATES.filter((s) => !have.has(s.name.toLowerCase()))
  const starterFor = (t: MealTemplate) => STARTER_TEMPLATES.find((s) => s.name.toLowerCase() === t.name.trim().toLowerCase())
  const outdated = (t: MealTemplate) => {
    const s = starterFor(t)
    return !!s && JSON.stringify(s.days) !== JSON.stringify(t.days)
  }
  async function runMessage(work: () => Promise<string>) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      setStatus(await work())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  async function addStarters(list: TemplateDraft[]) {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      for (const s of list) await p.onSave({ ...s, people: s.people ?? p.defaultPeople })
      setStatus(list.length === 1 ? `Added “${list[0].name}”.` : `Added ${list.length} starter templates.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

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
      const r = await p.onApply(t, { weekStart: isDay(t) ? day : week, mode, people, groceries })
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
            entries={p.entries}
            dayTemplates={dayTemplates}
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
            <GroceryReview shopping={view.shopping} people={view.people} onAdd={p.onAddGroceries} onDone={() => setView({ kind: 'list' })} />
          </>
        )}

        {view.kind === 'list' && (
          <>
            <h2>Meal plan templates</h2>
            <div className="row meal-templates__new">
              <button type="button" className="button button--primary" onClick={() => setView({ kind: 'edit', draft: blankTemplate(['dinner'], p.defaultPeople) })}>
                <AddIcon size={18} aria-hidden /> New week template
              </button>
              <button type="button" className="button" onClick={() => setView({ kind: 'edit', draft: blankTemplate(['breakfast', 'lunch', 'dinner'], p.defaultPeople, 'day') })}>
                <AddIcon size={18} aria-hidden /> New day template
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

            {p.templates.length === 0 && (
              <p className="empty">No templates yet. Make a day (“Taco Tuesday”) or a week, search your recipes or let the dice pick, or plan a week you like and save it. Week templates can be built from day templates.</p>
            )}
            {[
              { list: weekTemplates, title: 'Week templates' },
              { list: dayTemplates, title: 'Day templates' },
            ].filter((g) => g.list.length > 0).map((g) => (
              <section key={g.title} className="meal-templates__group" aria-label={g.title}>
              <h3>{g.title}</h3>
              <ul className="meal-templates__list" aria-label={g.title === 'Week templates' ? 'Templates' : g.title}>
                {g.list.map((t) => {
                  // On the week when at least half its meals are there as it planned them (templates that
                  // share a breakfast or two with the week don't count).
                  const matched = templateMealsOn(t, p.weekStart, p.weekPlans).keys.length
                  const total = t.days.reduce((n, d) => n + [d.breakfast, d.lunch, d.dinner].filter(Boolean).length, 0)
                  const onWeek = !isDay(t) && matched > 0 && matched * 2 >= total ? matched : 0
                  return (
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
                        <button type="button" className="icon-button" aria-label={`Edit template ${t.name}`} onClick={() => setView({ kind: 'edit', draft: { name: t.name, kind: t.kind, days: t.days, people: t.people, meals: t.meals }, id: t.id })}>
                          <PencilIcon size={18} />
                        </button>
                        <button type="button" className="icon-button" aria-label={`Copy template ${t.name}`} onClick={() => setView({ kind: 'edit', draft: { name: `${t.name} copy`.slice(0, 60), kind: t.kind, days: t.days, people: t.people, meals: t.meals } })}>
                          <CopyIcon size={18} />
                        </button>
                        <button type="button" className="icon-button" aria-label={`Delete template ${t.name}`} onClick={() => p.onDelete(t)}>
                          <TrashIcon size={18} />
                        </button>
                      </span>
                    </div>
                    {(onWeek > 0 || outdated(t)) && (
                      <div className="meal-templates__notes">
                        {onWeek > 0 && (
                          <span>
                            {count(onWeek, 'meal')} on {weekRange(p.weekStart)} ·{' '}
                            <button type="button" className="link" disabled={busy} onClick={() => void runMessage(() => p.onRemoveFromWeek(t))}>
                              Remove from this week
                            </button>
                          </span>
                        )}
                        {outdated(t) && (
                          <span>
                            A newer version uses the starter recipes ·{' '}
                            <button
                              type="button"
                              className="link"
                              disabled={busy}
                              onClick={() =>
                                void runMessage(async () => {
                                  const s = starterFor(t)!
                                  await p.onSave({ ...s, name: t.name, people: t.people }, t.id)
                                  return `Updated “${t.name}”.`
                                })
                              }
                            >
                              Update
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                    {using === t.id && (
                      <div className="meal-templates__use" role="group" aria-label={`Use ${t.name}`}>
                        {isDay(t) ? (
                          <label className="field meal-templates__people">
                            Which day
                            <Select value={day} options={nextDays.map((d) => ({ value: d, label: dayLabel(d) }))} onChange={setDay} aria-label="Which day" />
                          </label>
                        ) : (
                        <div className="segmented segmented--small" role="group" aria-label="Which week">
                          {weeks.map((w) => (
                            <button key={w.start} type="button" className={`segmented__item${week === w.start ? ' segmented__item--active' : ''}`} aria-pressed={week === w.start} onClick={() => setWeek(w.start)}>
                              {w.label}
                            </button>
                          ))}
                        </div>
                        )}
                        <div className="segmented segmented--small" role="group" aria-label="How">
                          {(
                            [
                              ['fill', 'Fill empty meals'],
                              ['replace', isDay(t) ? 'Replace the day' : 'Replace the week'],
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
                          {busy ? 'Planning…' : isDay(t) ? `Plan ${dayLabel(day)}` : `Plan ${weekRange(week)}`}
                        </button>
                      </div>
                    )}
                  </li>
                  )
                })}
              </ul>
              </section>
            ))}
            {status && (
              <p className="meal-groceries__result" role="status">
                {status}
              </p>
            )}

            {starters.length > 0 && (
              <section className="meal-templates__starters" aria-label="Starter templates">
                <div className="meal-templates__row">
                  <h3>Starter templates</h3>
                  {starters.length > 1 && (
                    <button type="button" className="button" disabled={busy} onClick={() => void addStarters(starters)}>
                      Add all {starters.length}
                    </button>
                  )}
                </div>
                <p className="settings-note">Simple weeks to start from: easy breakfasts, chicken, rice and vegetable lunches with a different sauce each day, one big dinner reheated through the week, and a fun one at the end. Change anything after adding.</p>
                <ul className="meal-templates__list">
                  {starters.map((s) => (
                    <li key={s.name}>
                      <div className="meal-templates__row">
                        <span>
                          <strong>{s.name}</strong>
                          <span className="muted"> · {summary(s)}</span>
                        </span>
                        <span className="row">
                          <button type="button" className="button" disabled={busy} onClick={() => void addStarters([s])}>
                            Add
                          </button>
                          <button type="button" className="icon-button" aria-label={`Look at and change ${s.name} before adding`} onClick={() => setView({ kind: 'edit', draft: { ...s, people: s.people ?? p.defaultPeople } })}>
                            <PencilIcon size={18} />
                          </button>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
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
