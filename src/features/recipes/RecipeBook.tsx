import { Select } from '../../components/Select'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatQuantity } from '@shared/recipes/quantity.js'
import { TAG_LABELS, TAG_OPTIONS, type RecipeTags } from '@shared/recipes/tagger.js'
import { BackIcon, ExternalLinkIcon, FiltersIcon, StarIcon } from '../../components/Icons'
import { addDays, fromDateKey } from '../../lib/dates'
import type { MealSlot } from '../../types'
import { amountText, stepText, useMetric } from './amounts'
import { ScaleBar } from './ScaleBar'
import {
  activeFilterCount,
  facetOptions,
  filterCatalog,
  NO_FILTERS,
  SORT_LABELS,
  sortCatalog,
  SOURCE_LABELS,
  TIME_LABELS,
  titleCase,
  type CatalogEntry,
  type CatalogFilters,
  type CatalogSort,
} from './catalog'
import { lines, type Recipe, type RecipeDraft } from './recipesApi'

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
  /** Adds these ingredient lines (as shown: scaled, metric) to the grocery list; resolves with how many were added. */
  onAddToGrocery?: (recipe: Recipe, items: string[]) => Promise<number> | number
  onMarkReviewed?: (recipe: Recipe) => void
  onFavorite?: (id: string, favorite: boolean) => void
  onSaveTags?: (recipe: Recipe, tags: RecipeTags) => void
  /** Open straight onto the "Needs review" list (from Settings → Cookbooks). */
  initialFilter?: 'all' | 'review'
  /** Opens cooking mode, at the batch size picked here. */
  onCook?: (recipe: Recipe, opts: CookOptions) => void
}

export interface CookOptions {
  scale: number
  /** Start on one big step at a time. */
  oneStep: boolean
}

const PAGE = 60

/** The family's recipe catalog: search, filters, favorites, import from a link; detail and editor. */
export function RecipeBook(p: BookProps) {
  const { entries, selected, current, onSelect, initialFilter = 'all' } = p
  const [filters, setFilters] = useState<CatalogFilters>({ ...NO_FILTERS, review: initialFilter === 'review' })
  const [showFilters, setShowFilters] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [sort, setSort] = useState<CatalogSort>('az')
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)
  const all = entries ?? []
  const reviewCount = all.filter((e) => e.r).length
  const shown = sortCatalog(filterCatalog(all, filters), sort)
  const listRef = useRef<HTMLUListElement>(null)
  const more = useRef<HTMLLIElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  // More rows load as the list box is scrolled near its end.
  useEffect(() => {
    const el = more.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((seen) => seen.some((x) => x.isIntersecting) && setLimit((l) => l + PAGE), { root: listRef.current, rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown.length, limit])

  // A phone shows the list above the recipe: picking one brings the recipe into view.
  const pick = (id: string) => {
    onSelect(id)
    if (document.documentElement.dataset.device === 'phone') requestAnimationFrame(() => detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }
  const backToList = () => {
    onSelect(null)
    requestAnimationFrame(() => listRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }))
  }
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
      <div className="recipe-book__list">
        <div className="row recipe-book__add">
          <button type="button" className="button button--primary" onClick={() => setEditing('new')}>
            New recipe
          </button>
        </div>

        <input type="search" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search titles, ingredients, books" aria-label="Search recipes" />
        <div className="row catalog-bar">
          <button type="button" className={`chip${filters.favorites ? ' chip--active' : ''}`} aria-pressed={filters.favorites} onClick={() => set({ favorites: !filters.favorites })}>
            <StarIcon size={16} fill={filters.favorites ? 'currentColor' : 'none'} /> Favorites
          </button>
          <button type="button" className={`chip${active - (filters.favorites ? 1 : 0) > 0 ? ' chip--active' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
            <FiltersIcon size={16} /> Filters
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
            <div className="catalog-head">
              <p className="muted catalog-count">
                {shown.length === all.length ? `${all.length} recipe${all.length === 1 ? '' : 's'}` : `${shown.length} of ${all.length}`}
              </p>
              <Select
                value={sort}
                onChange={(v) => {
                  setSort(v as CatalogSort)
                  listRef.current?.scrollTo?.(0, 0)
                }}
                aria-label="Sort recipes"
                options={(Object.keys(SORT_LABELS) as CatalogSort[]).map((k) => ({ value: k, label: SORT_LABELS[k] }))}
              />
            </div>
            <ul className="recipe-list" aria-label="Recipes" ref={listRef} tabIndex={-1}>
              {shown.slice(0, limit).map((e) => (
                <li key={e.id} className="recipe-item">
                  <button type="button" className={`recipe-row${e.id === selected ? ' recipe-row--active' : ''}`} aria-current={e.id === selected ? 'true' : undefined} onClick={() => pick(e.id)}>
                    <span className="recipe-row__title">
                      {e.t}
                      {e.r && <span className="badge badge--warn">Review</span>}
                    </span>
                    <span className="recipe-row__meta">{rowMeta(e)}</span>
                  </button>
                  {p.onFavorite && <FavoriteButton title={e.t} on={e.f} onToggle={() => p.onFavorite!(e.id, !e.f)} />}
                </li>
              ))}
              {shown.length === 0 && <li className="muted recipe-list__empty">{filters.review && !filters.q && active === 0 ? 'Nothing left to review.' : 'No matches.'}</li>}
              {shown.length > limit && (
                <li ref={more} className="recipe-list__more">
                  <button type="button" className="link" onClick={() => setLimit((l) => l + PAGE)}>
                    Show more ({shown.length - limit})
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      <div className="recipe-book__detail" ref={detailRef}>
        {selected && (
          <button type="button" className="recipe-book__back" onClick={backToList}>
            <BackIcon size={18} /> All recipes
          </button>
        )}
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
            onAddToGrocery={p.onAddToGrocery ? (items) => p.onAddToGrocery!(current, items) : undefined}
            onMarkReviewed={p.onMarkReviewed ? () => p.onMarkReviewed!(current) : undefined}
            onFavorite={p.onFavorite ? () => p.onFavorite!(current.id, !current.favorite) : undefined}
            onSaveTags={p.onSaveTags ? (tags) => p.onSaveTags!(current, tags) : undefined}
            onCook={p.onCook ? (o) => p.onCook!(current, o) : undefined}
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
      <StarIcon size={20} fill={on ? 'currentColor' : 'none'} />
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

interface ViewProps {
  recipe: Recipe
  today: string
  onEdit?: () => void
  onDelete?: () => void
  onPlan?: (date: string, slot: PlanSlot) => void
  onAddToGrocery?: (items: string[]) => Promise<number> | number
  onMarkReviewed?: () => void
  onFavorite?: () => void
  onSaveTags?: (tags: RecipeTags) => void
  onCook?: (opts: CookOptions) => void
}

const SLOT_LABELS: Record<PlanSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
const dayName = (date: string, today: string) =>
  date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : fromDateKey(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export function RecipeView({ recipe, today, onEdit, onDelete, onPlan, onAddToGrocery, onMarkReviewed, onFavorite, onSaveTags, onCook }: ViewProps) {
  const [grocery, setGrocery] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [planDate, setPlanDate] = useState(today)
  const [planSlot, setPlanSlot] = useState<PlanSlot>('dinner')
  const [planned, setPlanned] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState(false)
  const [factor, setFactor] = useState(1)
  const [metric, setMetric] = useMetric()
  const ingredients = lines(recipe.ingredients).map((l) => amountText(l, factor, metric))
  const steps = lines(recipe.steps).map((l) => stepText(l, metric))
  const online = recipe.source?.type === 'online'
  const tagList = recipe.tags ? (Object.keys(TAG_OPTIONS) as (keyof RecipeTags)[]).flatMap((k) => recipe.tags![k]) : []

  return (
    <article className="recipe" aria-label={recipe.title}>
      <header className="recipe__head">
        <div className="recipe__title-row">
          <h2 className="recipe__title">{recipe.title}</h2>
          <div className="row recipe__title-actions">
            {onCook && (
              <button type="button" className="button button--primary" onClick={() => onCook({ scale: factor, oneStep: false })}>
                Cook this
              </button>
            )}
            {onFavorite && <FavoriteButton title={recipe.title} on={!!recipe.favorite} onToggle={onFavorite} />}
          </div>
        </div>
        <p className="recipe__meta">
          {[
            recipe.minutes ? `${recipe.minutes} minutes` : null,
            recipe.servings ? `Serves ${formatQuantity(recipe.servings * factor)}` : factor !== 1 ? `${recipe.yieldText ? `${recipe.yieldText}, ` : ''}× ${formatQuantity(factor)}` : recipe.yieldText,
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
                  View original <ExternalLinkIcon size={14} />
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
          className="recipe__plan"
          aria-label="Plan this recipe"
          onSubmit={(e) => {
            e.preventDefault()
            onPlan(planDate, planSlot)
            setPlanned(`${dayName(planDate, today)} · ${SLOT_LABELS[planSlot]}`)
          }}
        >
          <span className="recipe__plan-label">Plan it</span>
          <div className="segmented segmented--small" role="group" aria-label="Day">
            {[today, addDays(today, 1)].map((d) => (
              <button key={d} type="button" className={`segmented__item${planDate === d ? ' segmented__item--active' : ''}`} aria-pressed={planDate === d} onClick={() => setPlanDate(d)}>
                {dayName(d, today)}
              </button>
            ))}
          </div>
          <input type="date" value={planDate} min={today} onChange={(e) => setPlanDate(e.target.value || today)} aria-label="Plan for date" required />
          <Select value={planSlot} onChange={(v) => setPlanSlot(v as PlanSlot)} aria-label="Meal" options={(Object.keys(SLOT_LABELS) as PlanSlot[]).map((k) => ({ value: k, label: SLOT_LABELS[k] }))} />
          <button className="button">Add to meal plan</button>
          {planned && (
            <span className="muted recipe__planned" role="status">
              On the meal plan: {planned}.
            </span>
          )}
        </form>
      )}

      <div className="recipe__body">
        <section aria-label="Ingredients">
          <h3>Ingredients</h3>
          {ingredients.length > 0 && <ScaleBar base={recipe.servings} factor={factor} onScale={setFactor} metric={metric} onMetric={setMetric} />}
          {onAddToGrocery && ingredients.length > 0 && (
            <div className="row recipe__grocery">
              <button
                type="button"
                className="button"
                onClick={async () => {
                  const n = await onAddToGrocery(ingredients)
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
          <div className="recipe__steps-head">
            <h3>Steps</h3>
            {onCook && steps.length > 1 && (
              <button type="button" className="button" onClick={() => onCook({ scale: factor, oneStep: true })}>
                Step by step
              </button>
            )}
          </div>
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
                onDelete()
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
