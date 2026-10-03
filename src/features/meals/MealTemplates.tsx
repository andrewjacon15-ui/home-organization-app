import { useState, type FormEvent } from 'react'
import { CloseIcon, TrashIcon } from '../../components/Icons'
import { isEmptyPlan, type ApplyMode, type MealTemplate } from './templates'

interface Props {
  /** "Oct 4 – 10": the week on screen, which a template is applied to. */
  weekLabel: string
  weekEmpty: boolean
  templates: MealTemplate[]
  onSave: (name: string) => Promise<void>
  /** Resolves with what happened, in a sentence. */
  onApply: (t: MealTemplate, mode: ApplyMode, groceries: boolean) => Promise<string>
  onDelete: (t: MealTemplate) => void
  onClose: () => void
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** "5 dinners, 2 lunches" */
function summary(t: MealTemplate): string {
  const n = (k: 'breakfast' | 'lunch' | 'dinner') => t.days.filter((d) => d[k]).length
  const parts = [n('dinner') && count(n('dinner'), 'dinner'), n('lunch') && count(n('lunch'), 'lunch'), n('breakfast') && count(n('breakfast'), 'breakfast')].filter(Boolean)
  return parts.length ? parts.join(', ') : t.days.some((d) => !isEmptyPlan(d)) ? 'Notes only' : 'Empty'
}

/**
 * Meal plan templates: save the week on screen ("School week"), and later drop it onto any
 * week, filling the empty meals or replacing the week, and stocking the grocery list for it.
 */
export function MealTemplates({ weekLabel, weekEmpty, templates, onSave, onApply, onDelete, onClose }: Props) {
  const [name, setName] = useState('')
  const [using, setUsing] = useState<string | null>(null)
  const [mode, setMode] = useState<ApplyMode>('fill')
  const [groceries, setGroceries] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const msg = await work()
      if (msg) setStatus(msg)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || weekEmpty) return
    void run(async () => {
      await onSave(name)
      const saved = name.trim()
      setName('')
      return `Saved “${saved}”.`
    })
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Meal plan templates" onClick={onClose}>
      <div className="overlay__panel meal-templates" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-button overlay__close" onClick={onClose} aria-label="Close">
          <CloseIcon size={22} />
        </button>
        <h2>Meal plan templates</h2>

        <form className="meal-templates__save" onSubmit={save}>
          <label className="field">
            Save {weekLabel} as a template
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="School week" maxLength={60} disabled={weekEmpty} />
          </label>
          <button className="button" disabled={busy || weekEmpty || !name.trim()}>
            Save template
          </button>
          {weekEmpty && <p className="settings-note">Plan some meals for this week first, then save it to reuse.</p>}
        </form>

        <h3>Use a template for {weekLabel}</h3>
        {templates.length === 0 ? (
          <p className="empty">No templates yet. Plan a week you like, then save it here.</p>
        ) : (
          <ul className="meal-templates__list" aria-label="Templates">
            {templates.map((t) => (
              <li key={t.id}>
                <div className="meal-templates__row">
                  <span>
                    <strong>{t.name}</strong>
                    <span className="muted"> · {summary(t)}</span>
                  </span>
                  <span className="row">
                    <button type="button" className={`button${using === t.id ? ' button--primary' : ''}`} aria-expanded={using === t.id} onClick={() => setUsing(using === t.id ? null : t.id)}>
                      Use
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete template ${t.name}`}
                      onClick={() => {
                        if (confirm(`Delete the template “${t.name}”? Weeks already planned from it stay as they are.`)) onDelete(t)
                      }}
                    >
                      <TrashIcon size={18} />
                    </button>
                  </span>
                </div>
                {using === t.id && (
                  <div className="meal-templates__use" role="group" aria-label={`Use ${t.name}`}>
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
                    <label className="meal-templates__check">
                      <input type="checkbox" checked={groceries} onChange={(e) => setGroceries(e.target.checked)} />
                      Add the ingredients to the grocery list
                    </label>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (mode === 'replace' && !weekEmpty && !confirm(`Replace everything planned for ${weekLabel} with “${t.name}”?`)) return
                          const msg = await onApply(t, mode, groceries)
                          setUsing(null)
                          return msg
                        })
                      }
                    >
                      {busy ? 'Applying…' : `Apply to ${weekLabel}`}
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
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
