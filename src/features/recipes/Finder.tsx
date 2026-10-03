import { BookOpen, Globe, Mic, MicOff, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { matchRecipe, rankByMatch, tokenizeHave, type MatchResult } from '@shared/recipes/matcher.js'
import { ICON_STROKE } from '../../components/Icons'
import { useSpeech } from '../../lib/useSpeech'
import { catalogReasons, type CatalogEntry, type ImportResult } from './catalog'
import { ImportForm } from './ImportForm'
import type { OnlineResult } from './kitchenApi'

/** How many choices a search offers. */
export const TOP = 5

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
            {r.parts.match != null && <Meter label="Ingredients" value={r.parts.match} />}
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

function OnlineResults({ results, byIngredients, onCook }: { results: OnlineResult[]; byIngredients: boolean; onCook?: (r: OnlineResult) => Promise<unknown> }) {
  return (
    <>
      <p className="settings-note finder__how">
        {byIngredients
          ? 'Ranked by how many of the ingredients you have (60%), cooks’ ratings (25%), and where the web search placed it (15%). Ratings count for more when lots of people rated.'
          : 'Ranked by cooks’ ratings (60%) and where the web search placed it (40%). Ratings count for more when lots of people rated.'}
      </p>
      <ol className="result-list" aria-label="Best matches">
        {results.length === 0 && <li className="muted">Nothing found on your recipe sites. Try different words.</li>}
        {results.map((r, i) => (
          <OnlineCard key={r.url} r={r} rank={i + 1} byIngredients={byIngredients} onCook={onCook} />
        ))}
      </ol>
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
  onOpen: (id: string) => void
  /** Undefined when online search isn't turned on. */
  onFindOnline?: (have: string) => Promise<OnlineResult[]>
  onCookOnline?: (r: OnlineResult) => Promise<unknown>
}

type Where = 'ours' | 'online'

/** What's in my kitchen: say or type what you have, then look in our recipes or online. */
export function KitchenSearch({ entries, staples, onOpen, onFindOnline, onCookOnline }: KitchenProps) {
  const [text, setText] = useState('')
  const [where, setWhere] = useState<Where | null>(null)
  const [local, setLocal] = useState<{ entry: CatalogEntry; result: MatchResult }[] | null>(null)
  const online = useOnline(onFindOnline)
  const [error, setError] = useState<string | null>(null)
  const speech = useSpeech((heard) => setText((t) => (t.trim() ? `${t.trim()}, ${heard}` : heard)))
  const understood = tokenizeHave(text)

  const look = (w: Where) => {
    setError(null)
    if (!understood.length) return setError('Tell me a few ingredients first, like “chicken, rice, broccoli”.')
    setWhere(w)
    if (w === 'ours') setLocal(rankByMatch(entries, (en) => matchRecipe(en.k, en.fa, understood, staples), TOP).map((r) => ({ entry: r.item, result: r.result })))
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
        <div className="finder__input">
          <label className="field">
            Ingredients
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="chicken thighs, rice, broccoli…" maxLength={1000} />
          </label>
          <button
            type="button"
            className={`icon-button finder__mic${speech.listening ? ' finder__mic--on' : ''}`}
            aria-label={speech.listening ? 'Stop listening' : 'Say what you have'}
            aria-pressed={speech.listening}
            onClick={speech.listening ? speech.stop : speech.start}
          >
            {speech.supported ? <Mic size={22} strokeWidth={ICON_STROKE} aria-hidden /> : <MicOff size={22} strokeWidth={ICON_STROKE} aria-hidden />}
          </button>
        </div>
        {speech.listening && (
          <p className="muted" role="status">
            Listening…
          </p>
        )}
        {speech.error && <p className="muted">{speech.error}</p>}
        {understood.length > 0 && <p className="finder__understood">Using: {names(understood.map((h) => h.key))}</p>}
        <p className="settings-note">Salt, pepper, oil and your other pantry staples (Settings → Kitchen) don't count against a recipe.</p>

        <p className="finder__step">2. Where should we look?</p>
        <div className="finder__where">
          <button type="button" className={`finder__choice${where === 'ours' ? ' finder__choice--on' : ''}`} aria-pressed={where === 'ours'} onClick={() => look('ours')}>
            <BookOpen size={22} strokeWidth={ICON_STROKE} aria-hidden />
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
            <Globe size={22} strokeWidth={ICON_STROKE} aria-hidden />
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
          <p className="settings-note finder__how">Ranked by how many of the ingredients you have, then fewest missing, then your favorites.</p>
          <ol className="result-list" aria-label="Best matches">
            {local.length === 0 && <li className="muted">No recipes saved yet.</li>}
            {local.map(({ entry, result }, i) => (
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
                    <Meter label="Ingredients" value={result.match} />
                  </div>
                  <HaveMissing have={result.have} missing={result.missing} />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {where === 'online' && online.results && <OnlineResults results={online.results} byIngredients onCook={onCookOnline} />}
    </section>
  )
}

interface WebProps {
  /** Undefined when online search isn't turned on. */
  onFind?: (dish: string) => Promise<OnlineResult[]>
  onCookOnline?: (r: OnlineResult) => Promise<unknown>
  onImport: (url: string) => Promise<ImportResult>
  onOpen: (id: string) => void
}

/** Search the web for a dish by name, or paste a link to a recipe. */
export function WebSearch({ onFind, onCookOnline, onImport, onOpen }: WebProps) {
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
          <div className="finder__input">
            <label className="field">
              Dish
              <input type="search" value={dish} onChange={(e) => setDish(e.target.value)} placeholder="chicken pot pie, banana bread…" maxLength={100} />
            </label>
            <button className="button button--primary finder__go" disabled={online.busy}>
              <Search size={18} strokeWidth={ICON_STROKE} aria-hidden /> {online.busy ? 'Searching…' : 'Search'}
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
      {online.results && <OnlineResults results={online.results} byIngredients={false} onCook={onCookOnline} />}

      <div className="finder__link">
        <p className="finder__step">Have a link?</p>
        <ImportForm onImport={onImport} onDone={onOpen} />
      </div>
    </section>
  )
}
