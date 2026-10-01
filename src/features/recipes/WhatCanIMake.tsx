import { Mic, MicOff, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { matchRecipe, rankByMatch, tokenizeHave, type MatchResult } from '@shared/recipes/matcher.js'
import { ICON_STROKE } from '../../components/Icons'
import { useSpeech } from '../../lib/useSpeech'
import type { CatalogEntry } from './catalog'
import type { OnlineResult } from './kitchenApi'

type Mode = 'cookbook' | 'online'

interface Props {
  entries: CatalogEntry[]
  staples: string[]
  onOpen: (id: string) => void
  /** Undefined when online search isn't available. */
  onFindOnline?: (have: string) => Promise<OnlineResult[]>
  /** Saves a web result to the catalog; resolves with its recipe ID. */
  onSaveOnline?: (r: OnlineResult) => Promise<string>
  onClose: () => void
}

const pct = (m: number) => `${Math.round(m * 100)}% match`
const names = (keys: string[]) => keys.join(', ')

/** Type or say what's in the kitchen; get the three best recipes from the catalog or the web. */
export function WhatCanIMake({ entries, staples, onOpen, onFindOnline, onSaveOnline, onClose }: Props) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('cookbook')
  const [local, setLocal] = useState<{ entry: CatalogEntry; result: MatchResult }[] | null>(null)
  const [online, setOnline] = useState<OnlineResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const speech = useSpeech((heard) => setText((t) => (t.trim() ? `${t.trim()}, ${heard}` : heard)))
  const understood = tokenizeHave(text)

  async function find(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!understood.length) return setError('Tell me a few ingredients, like “chicken, rice, broccoli”.')
    if (mode === 'cookbook') {
      setLocal(rankByMatch(entries, (en) => matchRecipe(en.k, en.fa, understood, staples)).map((r) => ({ entry: r.item, result: r.result })))
      return
    }
    if (!onFindOnline) return setError("Online search isn't set up yet.")
    setBusy(true)
    setOnline(null)
    try {
      setOnline(await onFindOnline(text))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const results = mode === 'cookbook' ? local : online
  return (
    <section className="wcim" aria-label="What can I make?">
      <header className="wcim__head">
        <h2>What can I make?</h2>
        <button type="button" className="icon-button" aria-label="Close What can I make?" onClick={onClose}>
          <X size={20} strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      </header>
      <form className="wcim__form" onSubmit={find}>
        <div className="wcim__input">
          <label className="field">
            What do you have?
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="chicken thighs, rice, broccoli…" maxLength={1000} />
          </label>
          <button
            type="button"
            className={`icon-button wcim__mic${speech.listening ? ' wcim__mic--on' : ''}`}
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
        {understood.length > 0 && <p className="wcim__understood">Using: {names(understood.map((h) => h.key))}</p>}
        <div className="row wcim__actions">
          <div className="segmented" role="group" aria-label="Search">
            {(['cookbook', 'online'] as Mode[]).map((m) => (
              <button key={m} type="button" className={`segmented__item${mode === m ? ' segmented__item--active' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'cookbook' ? 'Our recipes' : 'Online'}
              </button>
            ))}
          </div>
          <button className="button button--primary" disabled={busy}>
            {busy ? 'Searching…' : 'Find recipes'}
          </button>
        </div>
        <p className="settings-note">Salt, pepper, oil and your other pantry staples (Settings → Kitchen) don't count against a recipe.</p>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {results && (
        <ol className="wcim__results" aria-label="Best matches">
          {results.length === 0 && <li className="muted">{mode === 'cookbook' ? 'No recipes in the catalog yet.' : 'No recipes found on your sites. Try fewer ingredients.'}</li>}
          {mode === 'cookbook' &&
            local?.map(({ entry, result }) => (
              <li key={entry.id} className="wcim-card">
                <button type="button" className="wcim-card__title" onClick={() => onOpen(entry.id)}>
                  {entry.t}
                </button>
                <span className="wcim-card__meta">{[pct(result.match), entry.b, entry.m ? `${entry.m} min` : null].filter(Boolean).join(' · ')}</span>
                <MatchLines have={result.have} missing={result.missing} />
              </li>
            ))}
          {mode === 'online' &&
            online?.map((r) => (
              <li key={r.url} className="wcim-card">
                <button type="button" className="wcim-card__title" aria-expanded={open === r.url} onClick={() => setOpen(open === r.url ? null : r.url)}>
                  {r.title}
                </button>
                <span className="wcim-card__meta">
                  {[pct(r.match), r.rating?.value ? `★ ${r.rating.value.toFixed(1)}${r.rating.count ? ` (${r.rating.count.toLocaleString()})` : ''}` : null, r.credit ?? r.siteName, r.minutes ? `${r.minutes} min` : null].filter(Boolean).join(' · ')}
                </span>
                <MatchLines have={r.have} missing={r.missing} />
                {open === r.url && <OnlinePreview r={r} onSave={onSaveOnline ? async () => onOpen(await onSaveOnline(r)) : undefined} />}
              </li>
            ))}
        </ol>
      )}
    </section>
  )
}

function MatchLines({ have, missing }: { have: string[]; missing: string[] }) {
  return (
    <>
      {have.length > 0 && <span className="wcim-card__have">Have: {names(have)}</span>}
      <span className={missing.length ? 'wcim-card__missing' : 'wcim-card__have'}>{missing.length ? `Missing: ${names(missing)}` : 'You have everything.'}</span>
    </>
  )
}

function OnlinePreview({ r, onSave }: { r: OnlineResult; onSave?: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="wcim-preview">
      <div className="wcim-preview__cols">
        <section aria-label={`Ingredients for ${r.title}`}>
          <h3>Ingredients</h3>
          <ul>
            {r.ingredientLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
        <section aria-label={`Steps for ${r.title}`}>
          <h3>Steps</h3>
          <ol>
            {r.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      </div>
      <div className="row">
        {onSave && (
          <button
            type="button"
            className="button button--primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              setError(null)
              try {
                await onSave()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
                setSaving(false)
              }
            }}
          >
            {saving ? 'Saving…' : 'Save to our recipes'}
          </button>
        )}
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
  )
}
