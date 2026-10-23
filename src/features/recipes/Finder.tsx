import { useState, type FormEvent } from 'react'
import { listFromSpeech, matchRecipe, PRIORITY_LABELS, PRIORITY_WEIGHTS, rankOnline, RATED_MIN_MATCH, tokenizeHave, type MatchResult, type SearchPriority } from '@shared/recipes/matcher.js'
import { BookIcon, GlobeIcon, MicIcon, MicOffIcon, SearchIcon } from '../../components/Icons'
import { useSpeech } from '../../lib/useSpeech'
import { catalogReasons, rankOurs, type CatalogEntry, type ImportResult } from './catalog'
import { ListeningPanel, SearchingPanel } from './Feedback'
import { ImportForm } from './ImportForm'
import type { OnlineResult } from './kitchenApi'

/** How many choices a search offers at first ("Show more" for the rest). */
export const TOP = 5
/** Our recipes considered for re-sorting (the top 5 of them are shown first). */
const OURS_POOL = 12

/** The priority switch above results: what they're sorted by, changed without searching again. */
function PrioritySwitch({ value, onChange, options }: { value: SearchPriority; onChange: (p: SearchPriority) => void; options: SearchPriority[] }) {
  return (
    <div className="segmented segmented--small finder__priority" role="group" aria-label="Sort results by">
      {options.map((p) => (
        <button key={p} type="button" className={`segmented__item${p === value ? ' segmented__item--active' : ''}`} aria-pressed={p === value} onClick={() => onChange(p)}>
          {PRIORITY_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** How results are ordered, in words, for the priority chosen. */
function howRanked(priority: SearchPriority, byIngredients: boolean): string {
  if (!byIngredients) return priority === 'rating' ? 'Sorted by cooks’ ratings (80%) and where the web search placed it (20%).' : 'Sorted by cooks’ ratings (60%) and where the web search placed it (40%).'
  const w = PRIORITY_WEIGHTS[priority]
  const base = `Sorted by how well it fits what you have (${pct(w.fit)}), cooks’ ratings (${pct(w.rating)}), and web search position (${pct(w.search)}).`
  return priority === 'rating' ? `${base} Recipes using less than ${pct(RATED_MIN_MATCH)} of what you have are left out.` : base
}

const names = (keys: string[]) => keys.join(', ')
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <span className="meter" aria-label={`${label} ${pct}%`}>
      <span className="meter__label">{label}</span>
      <span className="meter__track" aria-hidden>
        <span className="meter__fill" style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

function HaveMissing({ have, missing }: { have: string[]; missing: string[] }) {
  return (
    <p className="result-card__have">
      {have.length > 0 && <span>Have: {names(have)}</span>}
      {missing.length > 0 && <span className="result-card__missing">Missing: {names(missing)}</span>}
    </p>
  )
}

/** One online pick: why it's here, how it scored, and a look at the recipe before cooking. */
function OnlineCard({ r, rank, byIngredients, onCook }: { r: OnlineResult; rank: number; byIngredients: boolean; onCook?: (r: OnlineResult) => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <li className="result-card">
      <span className="result-card__rank" aria-hidden>
        {rank}
      </span>
      <div className="result-card__body">
        <button type="button" className="result-card__title" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {r.title}
        </button>
        <p className="result-card__meta">{[r.credit ?? r.siteName, r.minutes ? `${r.minutes} min` : null].filter(Boolean).join(' · ')}</p>
        {r.reasons && r.reasons.length > 0 && (
          <ul className="result-card__reasons" aria-label={`Why ${r.title}`}>
            {r.reasons.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {r.parts && (
          <div className="result-card__meters">
            {r.parts.match != null && <Meter label="Ingredients" value={r.parts.fit ?? r.parts.match} />}
            <Meter label="Ratings" value={r.parts.rating} />
            <Meter label="Search rank" value={r.parts.search} />
          </div>
        )}
        {byIngredients && <HaveMissing have={r.have} missing={r.missing} />}
        {open && (
          <div className="result-card__preview">
            <section aria-label={`Ingredients for ${r.title}`}>
              <h4>Ingredients</h4>
              <ul>
                {r.ingredientLines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </section>
            <section aria-label={`Steps for ${r.title}`}>
              <h4>Steps</h4>
              <ol>
                {r.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          </div>
        )}
        <div className="row result-card__actions">
          {onCook && (
            <button
              type="button"
              className="button button--primary"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                setError(null)
                try {
                  await onCook(r)
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err))
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving ? 'Saving…' : 'Cook this'}
            </button>
          )}
          <button type="button" className="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide recipe' : 'Look at the recipe'}
          </button>
          <a href={r.url} target="_blank" rel="noreferrer noopener">
            View original
          </a>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}

function OnlineResults({ results, byIngredients, onCook, priority: initial }: { results: OnlineResult[]; byIngredients: boolean; onCook?: (r: OnlineResult) => Promise<unknown>; priority: SearchPriority }) {
  // A dish search has nothing to match, so only ratings vs balanced apply.
  const options: SearchPriority[] = byIngredients ? ['match', 'balanced', 'rating'] : ['balanced', 'rating']
  const [priority, setPriority] = useState<SearchPriority>(options.includes(initial) ? initial : 'balanced')
  const [all, setAll] = useState(false)
  const ranked = rankOnline(results, priority)
  const shown = all ? ranked : ranked.slice(0, TOP)
  return (
    <>
      {results.length > 1 && <PrioritySwitch value={priority} onChange={setPriority} options={options} />}
      <p className="settings-note finder__how">{howRanked(priority, byIngredients)} Ratings count for more when lots of people rated.</p>
      <ol className="result-list" aria-label="Best matches">
        {results.length === 0 && <li className="muted">Nothing found on your recipe sites. Try different words.</li>}
        {results.length > 0 && ranked.length === 0 && <li className="muted">None of these use enough of what you have. Try Best match.</li>}
        {shown.map((r, i) => (
          <OnlineCard key={r.url} r={r} rank={i + 1} byIngredients={byIngredients} onCook={onCook} />
        ))}
      </ol>
      {!all && ranked.length > TOP && (
        <button type="button" className="button finder__more" onClick={() => setAll(true)}>
          Show {ranked.length - TOP} more
        </button>
      )}
    </>
  )
}

function useOnline(find: ((text: string) => Promise<OnlineResult[]>) | undefined) {
  const [results, setResults] = useState<OnlineResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (text: string) => {
    if (!find) return
    setBusy(true)
    setError(null)
    setResults(null)
    try {
      setResults(await find(text))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return { results, busy, error, setError, run, clear: () => setResults(null) }
}

interface KitchenProps {
  entries: CatalogEntry[]
  staples: string[]
  /** How results are sorted at first (Settings → Kitchen). */
  priority?: SearchPriority
  onOpen: (id: string) => void
  /** Undefined when online search isn't turned on. */
  onFindOnline?: (have: string) => Promise<OnlineResult[]>
  onCookOnline?: (r: OnlineResult) => Promise<unknown>
}

type Where = 'ours' | 'online'

/** What's in my kitchen: say or type what you have, then look in our recipes or online. */
export function KitchenSearch({ entries, staples, onOpen, onFindOnline, onCookOnline, priority: initial = 'balanced' }: KitchenProps) {
  const [oursPriority, setOursPriority] = useState<SearchPriority>(initial)
  const [text, setText] = useState('')
  const [where, setWhere] = useState<Where | null>(null)
  const [local, setLocal] = useState<{ entry: CatalogEntry; result: MatchResult }[] | null>(null)
  const online = useOnline(onFindOnline)
  const [error, setError] = useState<string | null>(null)
  // Speech arrives as one run-on phrase; split it into a comma list so each ingredient reads on its own.
  const speech = useSpeech((heard) => {
    const list = listFromSpeech(heard)
    setText((t) => (t.trim() ? `${t.trim().replace(/,$/, '')}, ${list}` : list))
  })
  const understood = tokenizeHave(text)

  const look = (w: Where) => {
    setError(null)
    if (!understood.length) return setError('Tell me a few ingredients first, like “chicken, rice, broccoli”.')
    setWhere(w)
    if (w === 'ours')
      setLocal(
        entries
          .map((entry) => ({ entry, result: matchRecipe(entry.k, entry.fa, understood, staples) }))
          .sort((a, b) => b.result.fit - a.result.fit)
          .slice(0, OURS_POOL),
      )
    else void online.run(text)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    look(where ?? 'ours')
  }

  return (
    <section className="finder" aria-label="What's in my kitchen">
      <form className="finder__form" onSubmit={submit}>
        <p className="finder__step">1. What do you have?</p>
        <div className="finder__field">
          <label htmlFor="finder-ingredients">Ingredients</label>
          <div className="finder__input">
            <textarea id="finder-ingredients" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="chicken thighs, rice, broccoli…" maxLength={1000} />
            <button
              type="button"
              className={`icon-button finder__mic${speech.listening ? ' finder__mic--on' : ''}${speech.preparing ? ' finder__mic--preparing' : ''}`}
              aria-label={speech.listening ? 'Stop listening' : 'Say what you have'}
              aria-pressed={speech.listening}
              onClick={speech.listening ? speech.stop : speech.start}
            >
              {speech.supported ? <MicIcon size={22} /> : <MicOffIcon size={22} />}
            </button>
          </div>
        </div>
        {speech.listening && <ListeningPanel preparing={speech.preparing} heard={speech.heard} />}
        {speech.error && <p className="muted">{speech.error}</p>}
        {understood.length > 0 && <p className="finder__understood">Using: {names(understood.map((h) => h.key))}</p>}
        <p className="settings-note">Salt, pepper, oil and your other pantry staples (Settings → Kitchen) don't count against a recipe.</p>

        <p className="finder__step">2. Where should we look?</p>
        <div className="finder__where">
          <button type="button" className={`finder__choice${where === 'ours' ? ' finder__choice--on' : ''}`} aria-pressed={where === 'ours'} onClick={() => look('ours')}>
            <BookIcon size={22} />
            <span>
              <strong>Our recipes</strong>
              <span>{plural(entries.length, 'recipe')} saved</span>
            </span>
          </button>
          <button
            type="button"
            className={`finder__choice${where === 'online' ? ' finder__choice--on' : ''}`}
            aria-pressed={where === 'online'}
            disabled={!onFindOnline || online.busy}
            onClick={() => look('online')}
          >
            <GlobeIcon size={22} />
            <span>
              <strong>{online.busy ? 'Searching…' : 'Online'}</strong>
              <span>{onFindOnline ? 'Your trusted recipe sites' : 'Not turned on yet'}</span>
            </span>
          </button>
        </div>
      </form>

      {(error || online.error) && (
        <p className="error" role="alert">
          {error ?? online.error}
        </p>
      )}

      {where === 'ours' && local && (
        <>
          {local.length > 1 && <PrioritySwitch value={oursPriority} onChange={setOursPriority} options={['match', 'balanced', 'rating']} />}
          <p className="settings-note finder__how">
            {oursPriority === 'match'
              ? 'Sorted by how well each fits what you have.'
              : oursPriority === 'balanced'
                ? 'Sorted by how well each fits what you have, with a nudge for your favorites.'
                : `Your favorites first, among recipes using at least ${pct(RATED_MIN_MATCH)} of what you have.`}
          </p>
          <ol className="result-list" aria-label="Best matches">
            {local.length === 0 && <li className="muted">No recipes saved yet.</li>}
            {rankOurs(local, oursPriority).slice(0, TOP).map(({ entry, result }, i) => (
              <li key={entry.id} className="result-card">
                <span className="result-card__rank" aria-hidden>
                  {i + 1}
                </span>
                <div className="result-card__body">
                  <button type="button" className="result-card__title" onClick={() => onOpen(entry.id)}>
                    {entry.t}
                  </button>
                  {entry.b && <p className="result-card__meta">{entry.b}</p>}
                  <ul className="result-card__reasons" aria-label={`Why ${entry.t}`}>
                    {catalogReasons(entry, result).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <div className="result-card__meters">
                    <Meter label="Ingredients" value={result.fit} />
                  </div>
                  <HaveMissing have={result.have} missing={result.missing} />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {where === 'online' && online.busy && <SearchingPanel what="your recipe sites" />}
      {where === 'online' && online.results && <OnlineResults results={online.results} byIngredients onCook={onCookOnline} priority={initial} />}
    </section>
  )
}

interface WebProps {
  /** How results are sorted at first (Settings → Kitchen). */
  priority?: SearchPriority
  /** Undefined when online search isn't turned on. */
  onFind?: (dish: string) => Promise<OnlineResult[]>
  onCookOnline?: (r: OnlineResult) => Promise<unknown>
  onImport: (url: string) => Promise<ImportResult>
  onOpen: (id: string) => void
}

/** Search the web for a dish by name, or paste a link to a recipe. */
export function WebSearch({ onFind, onCookOnline, onImport, onOpen, priority = 'balanced' }: WebProps) {
  const [dish, setDish] = useState('')
  const online = useOnline(onFind)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!dish.trim()) return online.setError('Type the dish you want, like “chicken pot pie”.')
    void online.run(dish.trim())
  }
  return (
    <section className="finder" aria-label="Search the web">
      {onFind ? (
        <form className="finder__form" onSubmit={submit}>
          <p className="finder__step">What do you want to make?</p>
          <div className="finder__input finder__input--search">
            <label className="field">
              Dish
              <input type="search" value={dish} onChange={(e) => setDish(e.target.value)} placeholder="chicken pot pie, banana bread…" maxLength={100} />
            </label>
            <button className="button button--primary finder__go" disabled={online.busy}>
              <SearchIcon size={18} /> {online.busy ? 'Searching…' : 'Search'}
            </button>
          </div>
          <p className="settings-note">Searches your trusted recipe sites (Settings → Kitchen) and offers the best {TOP}.</p>
        </form>
      ) : (
        <p className="settings-note finder__off">Searching the web by name isn’t turned on yet. You can still add any recipe from a link.</p>
      )}
      {online.error && (
        <p className="error" role="alert">
          {online.error}
        </p>
      )}
      {online.busy && <SearchingPanel what={`for “${dish.trim()}”`} />}
      {online.results && <OnlineResults results={online.results} byIngredients={false} onCook={onCookOnline} priority={priority} />}

      <div className="finder__link">
        <p className="finder__step">Have a link?</p>
        <ImportForm onImport={onImport} onDone={onOpen} />
      </div>
    </section>
  )
}
