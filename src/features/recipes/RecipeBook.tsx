import { useState, type FormEvent } from 'react'
import type { MealSlot } from '../../types'
import { lines, type Recipe, type RecipeDraft } from './recipesApi'

type PlanSlot = Exclude<MealSlot, 'notes'>

interface BookProps {
  recipes: Recipe[]
  today: string
  onSave: (draft: RecipeDraft, id?: string) => Promise<string | void> | void
  onDelete: (recipe: Recipe) => void
  onPlan: (recipe: Recipe, date: string, slot: PlanSlot) => void
  /** Adds the recipe's ingredients to the grocery list; resolves with how many were added. */
  onAddToGrocery?: (recipe: Recipe) => Promise<number> | number
}

/** List + detail + editor for the family's recipes. */
export function RecipeBook({ recipes, today, onSave, onDelete, onPlan, onAddToGrocery }: BookProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)

  const q = query.trim().toLowerCase()
  const shown = q ? recipes.filter((r) => r.title.toLowerCase().includes(q) || r.ingredients.toLowerCase().includes(q)) : recipes
  const current = recipes.find((r) => r.id === selected) ?? null

  if (editing) {
    return (
      <RecipeForm
        initial={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSubmit={async (draft) => {
          const id = await onSave(draft, editing === 'new' ? undefined : editing.id)
          setEditing(null)
          if (typeof id === 'string') setSelected(id)
        }}
      />
    )
  }

  return (
    <section className="recipe-book">
      <div className="recipe-book__list">
        <div className="recipe-book__head">
          <h1 className="page-title">Recipes</h1>
          <button type="button" className="button button--primary" onClick={() => setEditing('new')}>
            New recipe
          </button>
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes or ingredients" aria-label="Search recipes" />
        {recipes.length === 0 ? (
          <p className="empty">No recipes yet. Add the family favorites.</p>
        ) : (
          <ul className="recipe-list" aria-label="Recipes">
            {shown.map((r) => (
              <li key={r.id}>
                <button type="button" className={`recipe-row${r.id === selected ? ' recipe-row--active' : ''}`} aria-current={r.id === selected ? 'true' : undefined} onClick={() => setSelected(r.id)}>
                  <span className="recipe-row__title">{r.title}</span>
                  <span className="recipe-row__meta">
                    {[r.minutes ? `${r.minutes} min` : null, r.servings ? `serves ${r.servings}` : null].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="muted">No matches.</li>}
          </ul>
        )}
      </div>

      <div className="recipe-book__detail">
        {current ? (
          <RecipeView recipe={current} today={today} onEdit={() => setEditing(current)} onDelete={() => onDelete(current)} onPlan={(date, slot) => onPlan(current, date, slot)} onAddToGrocery={onAddToGrocery ? () => onAddToGrocery(current) : undefined} />
        ) : (
          recipes.length > 0 && <p className="empty">Pick a recipe.</p>
        )}
      </div>
    </section>
  )
}

interface ViewProps {
  recipe: Recipe
  today: string
  onEdit?: () => void
  onDelete?: () => void
  onPlan?: (date: string, slot: PlanSlot) => void
  onAddToGrocery?: () => Promise<number> | number
}

export function RecipeView({ recipe, today, onEdit, onDelete, onPlan, onAddToGrocery }: ViewProps) {
  const [grocery, setGrocery] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [planDate, setPlanDate] = useState(today)
  const [planSlot, setPlanSlot] = useState<PlanSlot>('dinner')
  const [planned, setPlanned] = useState<string | null>(null)
  const ingredients = lines(recipe.ingredients)
  const steps = lines(recipe.steps)

  return (
    <article className="recipe" aria-label={recipe.title}>
      <header className="recipe__head">
        <h2 className="recipe__title">{recipe.title}</h2>
        <p className="recipe__meta">
          {[recipe.minutes ? `${recipe.minutes} minutes` : null, recipe.servings ? `Serves ${recipe.servings}` : null].filter(Boolean).join(' · ')}
          {recipe.url && (
            <>
              {' · '}
              <a href={recipe.url} target="_blank" rel="noreferrer noopener">
                Source
              </a>
            </>
          )}
        </p>
      </header>

      {onPlan && (
        <form
          className="recipe__plan row"
          aria-label="Plan this recipe"
          onSubmit={(e) => {
            e.preventDefault()
            onPlan(planDate, planSlot)
            setPlanned(`${planSlot} on ${planDate}`)
          }}
        >
          <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} aria-label="Plan for date" required />
          <select value={planSlot} onChange={(e) => setPlanSlot(e.target.value as PlanSlot)} aria-label="Meal">
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
          </select>
          <button className="button">Add to meal plan</button>
          {planned && (
            <span className="muted" role="status">
              Added as {planned}.
            </span>
          )}
        </form>
      )}

      <div className="recipe__body">
        <section aria-label="Ingredients">
          <h3>Ingredients</h3>
          {onAddToGrocery && ingredients.length > 0 && (
            <div className="row recipe__grocery">
              <button
                type="button"
                className="button"
                onClick={async () => {
                  const n = await onAddToGrocery()
                  setGrocery(`Added ${n} item${n === 1 ? '' : 's'} to the grocery list.`)
                }}
              >
                Add ingredients to grocery list
              </button>
              {grocery && (
                <span className="muted" role="status">
                  {grocery}
                </span>
              )}
            </div>
          )}
          {ingredients.length === 0 ? (
            <p className="muted">None listed.</p>
          ) : (
            <ul className="ingredients">
              {ingredients.map((item, i) => (
                <li key={i}>
                  <label className={checked.has(i) ? 'ingredient ingredient--got' : 'ingredient'}>
                    <input
                      type="checkbox"
                      checked={checked.has(i)}
                      onChange={() => {
                        const next = new Set(checked)
                        if (next.has(i)) next.delete(i)
                        else next.add(i)
                        setChecked(next)
                      }}
                    />
                    {item}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Steps">
          <h3>Steps</h3>
          {steps.length === 0 ? (
            <p className="muted">None listed.</p>
          ) : (
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {(onEdit || onDelete) && (
        <footer className="row recipe__actions">
          {onEdit && (
            <button type="button" className="button" onClick={onEdit}>
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="link"
              onClick={() => {
                if (confirm(`Delete "${recipe.title}"?`)) onDelete()
              }}
            >
              Delete
            </button>
          )}
        </footer>
      )}
    </article>
  )
}

function RecipeForm({ initial, onSubmit, onCancel }: { initial: Recipe | null; onSubmit: (d: RecipeDraft) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [servings, setServings] = useState(initial?.servings ? String(initial.servings) : '')
  const [minutes, setMinutes] = useState(initial?.minutes != null ? String(initial.minutes) : '')
  const [ingredients, setIngredients] = useState(initial?.ingredients ?? '')
  const [steps, setSteps] = useState(initial?.steps ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const urlOk = !url.trim() || /^https?:\/\/.+/.test(url.trim())

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !urlOk) return
    onSubmit({
      title,
      ingredients,
      steps,
      servings: servings ? Math.max(1, Math.floor(Number(servings))) : null,
      minutes: minutes ? Math.max(0, Math.floor(Number(minutes))) : null,
      url: url.trim() || null,
    })
  }

  return (
    <form className="recipe-form" onSubmit={submit} aria-label={initial ? 'Edit recipe' : 'New recipe'}>
      <h1 className="page-title">{initial ? 'Edit recipe' : 'New recipe'}</h1>
      <label className="field">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus />
      </label>
      <div className="recipe-form__nums">
        <label className="field">
          Serves
          <input type="number" min={1} max={100} value={servings} onChange={(e) => setServings(e.target.value)} />
        </label>
        <label className="field">
          Minutes
          <input type="number" min={0} max={10000} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Ingredients <span className="setting-row__hint">One per line</span>
        <textarea rows={8} value={ingredients} onChange={(e) => setIngredients(e.target.value)} maxLength={5000} />
      </label>
      <label className="field">
        Steps <span className="setting-row__hint">One per line</span>
        <textarea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={10000} />
      </label>
      <div className="field">
        <label htmlFor="recipe-url">Source link</label>
        <input
          id="recipe-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          maxLength={500}
          aria-invalid={!urlOk}
          aria-describedby={urlOk ? undefined : 'recipe-url-error'}
        />
        {!urlOk && (
          <span id="recipe-url-error" className="error">
            Links must start with http:// or https://
          </span>
        )}
      </div>
      <div className="row">
        <button className="button button--primary" disabled={!title.trim() || !urlOk}>
          Save recipe
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
