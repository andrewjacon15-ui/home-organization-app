import { ChefHat, ExternalLink, Link2, SlidersHorizontal, Star } from 'lucide-react'
import { Select } from '../../components/Select'
import { useState, type FormEvent } from 'react'
import { TAG_LABELS, TAG_OPTIONS, type RecipeTags } from '@shared/recipes/tagger.js'
import { ICON_STROKE } from '../../components/Icons'
import type { MealSlot } from '../../types'
import {
  activeFilterCount,
  facetOptions,
  filterCatalog,
  NO_FILTERS,
  SOURCE_LABELS,
  TIME_LABELS,
  titleCase,
  type CatalogEntry,
  type CatalogFilters,
  type ImportResult,
} from './catalog'
import type { OnlineResult } from './kitchenApi'
import { lines, type Recipe, type RecipeDraft } from './recipesApi'
import { WhatCanIMake } from './WhatCanIMake'

type PlanSlot = Exclude<MealSlot, 'notes'>

export interface BookProps {
  /** The catalog index; null while it loads. */
  entries: CatalogEntry[] | null
  /** The open recipe, loaded in full. */
  selected: string | null
  current: Recipe | null
  onSelect: (id: string | null) => void
  today: string
  onSave: (draft: RecipeDraft, id?: string) => Promise<string | void> | void
  onDelete: (recipe: Recipe) => void
  onPlan: (recipe: Recipe, date: string, slot: PlanSlot) => void
  /** Adds the recipe's ingredients to the grocery list; resolves with how many were added. */
  onAddToGrocery?: (recipe: Recipe) => Promise<number> | number
  onMarkReviewed?: (recipe: Recipe) => void
  onFavorite?: (id: string, favorite: boolean) => void
  onSaveTags?: (recipe: Recipe, tags: RecipeTags) => void
  /** Reads a recipe page on the server and adds it. */
  onImport?: (url: string) => Promise<ImportResult>
  /** Open straight onto the "Needs review" list (from Settings → Cookbooks). */
  initialFilter?: 'all' | 'review'
  /** "What can I make?": pantry staples, and online search when it's set up. */
  staples?: string[]
  onFindOnline?: (have: string) => Promise<OnlineResult[]>
  onSaveOnline?: (r: OnlineResult) => Promise<string>
  /** Opens cooking mode. */
  onCook?: (recipe: Recipe) => void
}

const PAGE = 150

/** The family's recipe catalog: search, filters, favorites, import from a link; detail and editor. */
export function RecipeBook(p: BookProps) {
  const { entries, selected, current, onSelect, initialFilter = 'all' } = p
  const [filters, setFilters] = useState<CatalogFilters>({ ...NO_FILTERS, review: initialFilter === 'review' })
  const [showFilters, setShowFilters] = useState(false)
  const [importing, setImporting] = useState(false)
  const [asking, setAsking] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)
  const all = entries ?? []
  const reviewCount = all.filter((e) => e.r).length
  const shown = filterCatalog(all, filters)
  const set = (changes: Partial<CatalogFilters>) => {
    setFilters((f) => ({ ...f, ...changes }))
    setLimit(PAGE)
  }
  const active = activeFilterCount(filters)

  if (editing) {
    return (
      <RecipeForm
        initial={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSubmit={async (draft) => {
          const id = await p.onSave(draft, editing === 'new' ? undefined : editing.id)
          setEditing(null)
          if (typeof id === 'string') onSelect(id)
        }}
      />
    )
  }

  return (
    <section className="recipe-book">
      {asking && (
        <div className="recipe-book__ask">
          <WhatCanIMake
            entries={all}
            staples={p.staples ?? []}
            onOpen={(id) => {
              onSelect(id)
              setAsking(false)
            }}
            onFindOnline={p.onFindOnline}
            onSaveOnline={p.onSaveOnline}
            onClose={() => setAsking(false)}
          />
        </div>
      )}
      <div className="recipe-book__list">
        <div className="recipe-book__head">
          <h1 className="page-title">Recipes</h1>
          <div className="row recipe-book__add">
            <button type="button" className="button" aria-expanded={asking} onClick={() => setAsking((v) => !v)}>
              <ChefHat size={18} strokeWidth={ICON_STROKE} aria-hidden /> What can I make?
            </button>
            {p.onImport && (
              <button type="button" className="button" aria-expanded={importing} onClick={() => setImporting((v) => !v)}>
                <Link2 size={18} strokeWidth={ICON_STROKE} aria-hidden /> Add from link
              </button>
            )}
            <button type="button" className="button button--primary" onClick={() => setEditing('new')}>
              New recipe
            </button>
          </div>
        </div>
        {importing && p.onImport && (
          <ImportForm
            onImport={p.onImport}
            onDone={(id) => {
              onSelect(id)
              setFilters(NO_FILTERS)
            }}
            onClose={() => setImporting(false)}
          />
        )}

        <input type="search" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search titles, ingredients, books" aria-label="Search recipes" />
        <div className="row catalog-bar">
          <button type="button" className={`chip${filters.favorites ? ' chip--active' : ''}`} aria-pressed={filters.favorites} onClick={() => set({ favorites: !filters.favorites })}>
            <Star size={16} strokeWidth={ICON_STROKE} fill={filters.favorites ? 'currentColor' : 'none'} aria-hidden /> Favorites
          </button>
          <button type="button" className={`chip${active - (filters.favorites ? 1 : 0) > 0 ? ' chip--active' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={16} strokeWidth={ICON_STROKE} aria-hidden /> Filters
            {active - (filters.favorites ? 1 : 0) > 0 ? ` (${active - (filters.favorites ? 1 : 0)})` : ''}
          </button>
          {(reviewCount > 0 || filters.review) && (
            <button type="button" className={`chip${filters.review ? ' chip--active' : ''}`} aria-pressed={filters.review} onClick={() => set({ review: !filters.review })}>
              Needs review ({reviewCount})
            </button>
          )}
          {active > 0 && (
            <button type="button" className="link" onClick={() => set({ ...NO_FILTERS, q: filters.q, review: filters.review })}>
              Clear
            </button>
          )}
        </div>
        {showFilters && <FilterPanel entries={all} filters={filters} onChange={set} />}

        {entries === null ? (
          <p className="muted" role="status">
            Loading recipes…
          </p>
        ) : all.length === 0 ? (
          <p className="empty">No recipes yet. Add the family favorites, paste a link, or upload a cookbook in Settings.</p>
        ) : (
          <>
            <p className="muted catalog-count">
              {shown.length === all.length ? `${all.length} recipe${all.length === 1 ? '' : 's'}` : `${shown.length} of ${all.length}`}
            </p>
            <ul className="recipe-list" aria-label="Recipes">
              {shown.slice(0, limit).map((e) => (
                <li key={e.id} className="recipe-item">
                  <button type="button" className={`recipe-row${e.id === selected ? ' recipe-row--active' : ''}`} aria-current={e.id === selected ? 'true' : undefined} onClick={() => onSelect(e.id)}>
                    <span className="recipe-row__title">
                      {e.t}
                      {e.r && <span className="badge badge--warn">Review</span>}
                    </span>
                    <span className="recipe-row__meta">{rowMeta(e)}</span>
                  </button>
                  {p.onFavorite && <FavoriteButton title={e.t} on={e.f} onToggle={() => p.onFavorite!(e.id, !e.f)} />}
                </li>
              ))}
              {shown.length === 0 && <li className="muted">{filters.review && !filters.q && active === 0 ? 'Nothing left to review.' : 'No matches.'}</li>}
            </ul>
            {shown.length > limit && (
              <button type="button" className="button" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({shown.length - limit})
              </button>
            )}
          </>
        )}
      </div>

      <div className="recipe-book__detail">
        {current && current.id === selected ? (
          <RecipeView
            recipe={current}
            today={p.today}
            onEdit={() => setEditing(current)}
            onDelete={() => {
              p.onDelete(current)
              onSelect(null)
            }}
            onPlan={(date, slot) => p.onPlan(current, date, slot)}
            onAddToGrocery={p.onAddToGrocery ? () => p.onAddToGrocery!(current) : undefined}
            onMarkReviewed={p.onMarkReviewed ? () => p.onMarkReviewed!(current) : undefined}
            onFavorite={p.onFavorite ? () => p.onFavorite!(current.id, !current.favorite) : undefined}
            onSaveTags={p.onSaveTags ? (tags) => p.onSaveTags!(current, tags) : undefined}
            onCook={p.onCook ? () => p.onCook!(current) : undefined}
          />
        ) : selected ? (
          <p className="muted" role="status">
            Opening…
          </p>
        ) : (
          all.length > 0 && <p className="empty">Pick a recipe.</p>
        )}
      </div>
    </section>
  )
}

function rowMeta(e: CatalogEntry): string {
  const tag = e.g.cuisine[0] ?? e.g.meal[0] ?? null
  return [e.b, e.m ? `${e.m} min` : null, tag ? titleCase(tag) : null].filter(Boolean).join(' · ')
}

function FavoriteButton({ title, on, onToggle }: { title: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`icon-button favorite${on ? ' favorite--on' : ''}`} aria-pressed={on} aria-label={`Favorite ${title}`} title={on ? 'Remove from favorites' : 'Add to favorites'} onClick={onToggle}>
      <Star size={20} strokeWidth={ICON_STROKE} fill={on ? 'currentColor' : 'none'} aria-hidden />
    </button>
  )
}

function FilterPanel({ entries, filters, onChange }: { entries: CatalogEntry[]; filters: CatalogFilters; onChange: (c: Partial<CatalogFilters>) => void }) {
  const facets = [
    { key: 'meal', label: 'Meal', any: 'Any meal', name: titleCase },
    { key: 'cuisine', label: 'Cuisine', any: 'Any cuisine', name: titleCase },
    { key: 'main', label: 'Main ingredient', any: 'Any main ingredient', name: titleCase },
    { key: 'time', label: 'Time', any: 'Any time', name: (v: string) => TIME_LABELS[v as keyof typeof TIME_LABELS] },
    { key: 'diet', label: 'Diet', any: 'Any diet', name: titleCase },
    { key: 'source', label: 'Source', any: 'Any source', name: (v: string) => SOURCE_LABELS[v as keyof typeof SOURCE_LABELS] },
  ] as const
  return (
    <div className="catalog-filters" role="group" aria-label="Filters">
      {facets.map((f) => {
        const options = facetOptions(entries, filters, f.key)
        return (
          <label key={f.key} className="field catalog-filters__field">
            {f.label}
            <Select
              value={filters[f.key]}
              onChange={(v) => onChange({ [f.key]: v })}
              disabled={options.length === 0 && !filters[f.key]}
              options={[{ value: '', label: f.any }, ...options.map((o) => ({ value: o.value, label: `${f.name(o.value)} (${o.count})` }))]}
            />
          </label>
        )
      })}
      <p className="settings-note catalog-filters__note">Tags are added automatically from each recipe; fix any on the recipe. Always check labels for allergies.</p>
    </div>
  )
}

function ImportForm({ onImport, onDone, onClose }: { onImport: (url: string) => Promise<ImportResult>; onDone: (id: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim())

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const r = await onImport(url.trim())
      setMessage({ kind: 'ok', text: r.existed ? `“${r.title}” was already in your recipes — refreshed it.` : `Added “${r.title}”.${r.needsReview ? ' Give it a quick check.' : ''}` })
      setUrl('')
      onDone(r.id)
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="import-form" onSubmit={submit} aria-label="Add a recipe from a link">
      <label className="field">
        Recipe link
        <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link to a recipe page" autoFocus maxLength={2000} disabled={busy} />
      </label>
      <div className="row">
        <button className="button button--primary" disabled={!valid || busy}>
          {busy ? 'Reading the recipe…' : 'Add recipe'}
        </button>
        <button type="button" className="button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      {message && (
        <p className={message.kind === 'error' ? 'error' : 'muted'} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </form>
  )
}

interface ViewProps {
  recipe: Recipe
  today: string
  onEdit?: () => void
  onDelete?: () => void
  onPlan?: (date: string, slot: PlanSlot) => void
  onAddToGrocery?: () => Promise<number> | number
  onMarkReviewed?: () => void
  onFavorite?: () => void
  onSaveTags?: (tags: RecipeTags) => void
  onCook?: () => void
}

export function RecipeView({ recipe, today, onEdit, onDelete, onPlan, onAddToGrocery, onMarkReviewed, onFavorite, onSaveTags, onCook }: ViewProps) {
  const [grocery, setGrocery] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [planDate, setPlanDate] = useState(today)
  const [planSlot, setPlanSlot] = useState<PlanSlot>('dinner')
  const [planned, setPlanned] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState(false)
  const ingredients = lines(recipe.ingredients)
  const steps = lines(recipe.steps)
  const online = recipe.source?.type === 'online'
  const tagList = recipe.tags ? (Object.keys(TAG_OPTIONS) as (keyof RecipeTags)[]).flatMap((k) => recipe.tags![k]) : []

  return (
    <article className="recipe" aria-label={recipe.title}>
      <header className="recipe__head">
        <div className="recipe__title-row">
          <h2 className="recipe__title">{recipe.title}</h2>
          <div className="row recipe__title-actions">
            {onCook && (
              <button type="button" className="button button--primary" onClick={onCook}>
                Cook this
              </button>
            )}
            {onFavorite && <FavoriteButton title={recipe.title} on={!!recipe.favorite} onToggle={onFavorite} />}
          </div>
        </div>
        <p className="recipe__meta">
          {[
            recipe.minutes ? `${recipe.minutes} minutes` : null,
            recipe.servings ? `Serves ${recipe.servings}` : recipe.yieldText,
            recipe.rating?.value ? `★ ${recipe.rating.value.toFixed(1)}${recipe.rating.count ? ` (${recipe.rating.count.toLocaleString()})` : ''}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          {recipe.url && !online && (
            <>
              {' · '}
              <a href={recipe.url} target="_blank" rel="noreferrer noopener">
                Source
              </a>
            </>
          )}
        </p>
        {recipe.source?.type === 'cookbook' && (
          <p className="recipe__source">
            From <cite>{recipe.source.bookTitle}</cite>
            {recipe.source.location ? `, ${recipe.source.location}` : ''}
            {recipe.credit ? ` · Recipe by ${recipe.credit}` : ''}
          </p>
        )}
        {recipe.notes && <p className="recipe__notes">{recipe.notes}</p>}
        {online && (
          <p className="recipe__source">
            From <cite>{recipe.credit || recipe.source?.siteName}</cite>
            {recipe.url && (
              <>
                {' · '}
                <a href={recipe.url} target="_blank" rel="noreferrer noopener" className="recipe__original">
                  View original <ExternalLink size={14} strokeWidth={ICON_STROKE} aria-hidden />
                </a>
              </>
            )}
          </p>
        )}
        {editingTags && onSaveTags ? (
          <TagEditor
            initial={recipe.tags}
            onCancel={() => setEditingTags(false)}
            onSave={(tags) => {
              onSaveTags(tags)
              setEditingTags(false)
            }}
          />
        ) : (
          (tagList.length > 0 || onSaveTags) && (
            <div className="recipe__tags" aria-label="Tags">
              {tagList.map((t) => (
                <span key={t} className="tag">
                  {titleCase(t)}
                </span>
              ))}
              {onSaveTags && (
                <button type="button" className="link" onClick={() => setEditingTags(true)}>
                  {tagList.length ? 'Edit tags' : 'Add tags'}
                </button>
              )}
            </div>
          )
        )}
      </header>

      {recipe.needsReview && (
        <div className="recipe__review" role="note">
          <p>
            <strong>Needs review.</strong> This was read automatically{recipe.source?.location?.includes('OCR') ? ' from a scanned page' : ''} and may have mistakes. Check it against {online ? 'the original page' : 'the book'}.
          </p>
          <div className="row">
            {onMarkReviewed && (
              <button type="button" className="button button--primary" onClick={onMarkReviewed}>
                Looks right
              </button>
            )}
            {onEdit && (
              <button type="button" className="button" onClick={onEdit}>
                Fix it
              </button>
            )}
          </div>
        </div>
      )}

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
          <Select
            value={planSlot}
            onChange={(v) => setPlanSlot(v as PlanSlot)}
            aria-label="Meal"
            options={[
              { value: 'breakfast', label: 'Breakfast' },
              { value: 'lunch', label: 'Lunch' },
              { value: 'dinner', label: 'Dinner' },
            ]}
          />
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

function TagEditor({ initial, onSave, onCancel }: { initial?: RecipeTags; onSave: (t: RecipeTags) => void; onCancel: () => void }) {
  const [tags, setTags] = useState<RecipeTags>(initial ?? { meal: [], cuisine: [], main: [], diet: [] })
  const toggle = (k: keyof RecipeTags, v: string) => setTags((t) => ({ ...t, [k]: t[k].includes(v) ? t[k].filter((x) => x !== v) : [...t[k], v] }))
  return (
    <div className="tag-editor" role="group" aria-label="Edit tags">
      {(Object.keys(TAG_OPTIONS) as (keyof RecipeTags)[]).map((k) => (
        <fieldset key={k} className="tag-editor__group">
          <legend>{TAG_LABELS[k]}</legend>
          <div className="row">
            {TAG_OPTIONS[k].map((v) => (
              <button key={v} type="button" className={`chip${tags[k].includes(v) ? ' chip--active' : ''}`} aria-pressed={tags[k].includes(v)} onClick={() => toggle(k, v)}>
                {titleCase(v)}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="row">
        <button type="button" className="button button--primary" onClick={() => onSave(tags)}>
          Save tags
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
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
      tagsEdited: initial?.tagsEdited ?? false,
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
