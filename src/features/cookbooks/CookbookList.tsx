import { useEffect, useId, useRef, useState } from 'react'
import { BookIcon, PencilIcon, RefreshCwIcon, TrashIcon } from '../../components/Icons'
import type { Cookbook } from './cookbooksApi'

interface Props {
  books: Cookbook[]
  /** Uploads in progress, by file name (0–1). */
  uploads: Record<string, number>
  coverUrl: (path: string) => Promise<string>
  onUpload: (files: File[]) => void
  onRename: (book: Cookbook, title: string) => void
  onReparse: (book: Cookbook) => void
  onDelete: (book: Cookbook, removeRecipes: boolean) => void
  onReview: (book: Cookbook) => void
}

function statusText(b: Cookbook): string {
  switch (b.status) {
    case 'uploading':
      return 'Uploading…'
    case 'queued':
      return 'Waiting to start…'
    case 'parsing':
      return b.progress ? `Reading ${b.progress.unit} ${b.progress.done} of ${b.progress.total}…` : 'Reading…'
    case 'error':
      return b.error ?? "Couldn't read this book."
    default:
      return 'Ready'
  }
}

/** The family's cookbook library: upload, progress, rename, re-parse, delete. */
export function CookbookList({ books, uploads, coverUrl, onUpload, onRename, onReparse, onDelete, onReview }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [deleting, setDeleting] = useState<Cookbook | null>(null)
  const uploading = Object.entries(uploads)

  return (
    <div className="cookbooks">
      <div className="row cookbooks__head">
        <button type="button" className="button button--primary" onClick={() => input.current?.click()}>
          Upload cookbook
        </button>
        <span className="setting-row__hint">EPUB or PDF, up to 300 MB. Upload from your phone or computer.</span>
        <input
          ref={input}
          type="file"
          accept=".epub,.pdf,application/pdf,application/epub+zip"
          multiple
          hidden
          aria-label="Choose cookbook files"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) onUpload(files)
          }}
        />
      </div>

      {uploading.map(([name, fraction]) => (
        <div key={name} className="cookbook cookbook--uploading" role="status">
          <span className="cookbook__title">{name}</span>
          <progress max={1} value={fraction} aria-label={`Uploading ${name}`} />
        </div>
      ))}

      {books.length === 0 && uploading.length === 0 ? (
        <p className="settings-note">No cookbooks yet. Scanned books are read with OCR and their recipes are marked for review.</p>
      ) : (
        <ul className="cookbook-list" aria-label="Cookbooks">
          {books.map((b) => (
            <CookbookRow key={b.id} book={b} coverUrl={coverUrl} onRename={onRename} onReparse={onReparse} onAskDelete={setDeleting} onReview={onReview} />
          ))}
        </ul>
      )}

      {deleting && <DeleteDialog book={deleting} onCancel={() => setDeleting(null)} onConfirm={(remove) => (onDelete(deleting, remove), setDeleting(null))} />}
    </div>
  )
}

function CookbookRow({ book: b, coverUrl, onRename, onReparse, onAskDelete, onReview }: { book: Cookbook; coverUrl: Props['coverUrl']; onRename: Props['onRename']; onReparse: Props['onReparse']; onAskDelete: (b: Cookbook) => void; onReview: Props['onReview'] }) {
  const [cover, setCover] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(b.title)
  const busy = b.status === 'uploading' || b.status === 'queued' || b.status === 'parsing'

  useEffect(() => {
    let live = true
    if (b.coverPath) coverUrl(b.coverPath).then((u) => live && setCover(u), () => undefined)
    return () => {
      live = false
    }
  }, [b.coverPath, coverUrl])

  const meta = [b.format.toUpperCase(), b.author, b.status === 'done' || b.recipeCount ? `${b.recipeCount} recipe${b.recipeCount === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')

  return (
    <li className="cookbook" aria-label={b.title}>
      <div className="cookbook__cover" aria-hidden>
        {/* A missing or broken cover falls back to the book icon. */}
        {cover ? <img src={cover} alt="" onError={() => setCover(null)} /> : <BookIcon size={28} />}
      </div>
      <div className="cookbook__body">
        {renaming ? (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) onRename(b, draft)
              setRenaming(false)
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} aria-label="Cookbook title" autoFocus />
            <button className="button button--primary">Save</button>
            <button type="button" className="button" onClick={() => (setRenaming(false), setDraft(b.title))}>
              Cancel
            </button>
          </form>
        ) : (
          <span className="cookbook__title">{b.title}</span>
        )}
        <span className="cookbook__meta">
          {meta}
          {b.ocr && <span className="badge" title="Read from scanned pages with OCR; check its recipes">OCR</span>}
        </span>
        <span className={`cookbook__status${b.status === 'error' ? ' error' : ''}`} role={busy ? 'status' : undefined}>
          {statusText(b)}
        </span>
        {b.status === 'parsing' && b.progress && <progress max={b.progress.total || 1} value={b.progress.done} aria-label={`Reading ${b.title}`} />}
        {b.reviewCount > 0 && (
          <button type="button" className="link cookbook__review" onClick={() => onReview(b)}>
            {b.reviewCount} need{b.reviewCount === 1 ? 's' : ''} review
          </button>
        )}
      </div>
      <div className="cookbook__actions">
        <IconButton label={`Rename ${b.title}`} onClick={() => setRenaming(true)} icon={<PencilIcon size={18} />} />
        <IconButton label={`Re-parse ${b.title}`} disabled={busy} onClick={() => onReparse(b)} icon={<RefreshCwIcon size={18} />} />
        <IconButton label={`Delete ${b.title}`} onClick={() => onAskDelete(b)} icon={<TrashIcon size={18} />} />
      </div>
    </li>
  )
}

function IconButton({ label, icon, onClick, disabled }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {icon}
    </button>
  )
}

function DeleteDialog({ book, onCancel, onConfirm }: { book: Cookbook; onCancel: () => void; onConfirm: (removeRecipes: boolean) => void }) {
  const [remove, setRemove] = useState(false)
  const id = useId()
  return (
    <div className="dialog__backdrop" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-label={`Delete ${book.title}`} onClick={(e) => e.stopPropagation()}>
        <h3>Delete “{book.title}”?</h3>
        <p className="settings-note">The book file is removed from the app.</p>
        {book.recipeCount > 0 && (
          <label className="dialog__check" htmlFor={id}>
            <input id={id} type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
            Also remove its {book.recipeCount} recipe{book.recipeCount === 1 ? '' : 's'} from the catalog
          </label>
        )}
        <div className="row dialog__actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button button--danger" onClick={() => onConfirm(remove)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
