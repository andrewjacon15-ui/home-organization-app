import { useState, type FormEvent } from 'react'
import type { ImportResult } from './catalog'

/** Paste a link to any recipe page; the server reads the recipe and adds it. */
export function ImportForm({ onImport, onDone, onClose, autoFocus = false }: { onImport: (url: string) => Promise<ImportResult>; onDone: (id: string) => void; onClose?: () => void; autoFocus?: boolean }) {
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
        <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link to a recipe page" autoFocus={autoFocus} maxLength={2000} disabled={busy} />
      </label>
      <div className="row">
        <button className="button button--primary" disabled={!valid || busy}>
          {busy ? 'Reading the recipe…' : 'Add recipe'}
        </button>
        {onClose && (
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        )}
      </div>
      {message && (
        <p className={message.kind === 'error' ? 'error' : 'muted'} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </form>
  )
}
