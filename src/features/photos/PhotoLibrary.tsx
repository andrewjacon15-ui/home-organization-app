import { useRef, useState } from 'react'
import type { Photo } from './photosApi'

interface Props {
  photos: Photo[]
  /** 0..1 while an upload batch is running, null otherwise. */
  progress: { done: number; total: number; fraction: number } | null
  onUpload: (files: File[]) => void
  onCaption: (photo: Photo, caption: string) => void
  onDelete: (photo: Photo) => void
  onStart: () => void
}

export function PhotoLibrary({ photos, progress, onUpload, onCaption, onDelete, onStart }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState<Photo | null>(null)
  const selected = open && photos.find((p) => p.id === open.id)

  return (
    <div className="photos">
      <header className="photos__head">
        <h1 className="page-title">Photos</h1>
        <div className="row">
          <button type="button" className="button" disabled={photos.length === 0} onClick={onStart}>
            Start slideshow
          </button>
          <button type="button" className="button button--primary" disabled={!!progress} onClick={() => input.current?.click()}>
            Add photos
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            aria-label="Choose photos or videos"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length) onUpload(files)
            }}
          />
        </div>
      </header>

      {progress && (
        <div className="photos__progress" role="status">
          Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…
          <progress max={1} value={(progress.done + progress.fraction) / progress.total} />
        </div>
      )}

      {photos.length === 0 ? (
        <p className="empty">No photos yet. Add some and the wall display shows them as a slideshow when nobody's using it.</p>
      ) : (
        <ul className="photos__grid">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" className="photos__thumb" aria-label={p.caption || (p.kind === 'video' ? 'Video' : 'Photo')} onClick={() => setOpen(p)}>
                {p.kind === 'video' ? <video src={p.url} muted preload="metadata" /> : <img src={p.url} alt="" loading="lazy" />}
                {p.kind === 'video' && <span className="photos__badge">Video</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="photos__backdrop" onClick={() => setOpen(null)}>
          <div className="photos__detail" role="dialog" aria-label="Photo details" onClick={(e) => e.stopPropagation()}>
            {selected.kind === 'video' ? <video src={selected.url} controls muted playsInline /> : <img src={selected.url} alt={selected.caption} />}
            <CaptionField key={selected.id} value={selected.caption} onSave={(c) => onCaption(selected, c)} />
            <div className="row photos__actions">
              <button
                type="button"
                className="link photos__delete"
                onClick={() => {
                  if (confirm('Delete this from the family photos?')) {
                    onDelete(selected)
                    setOpen(null)
                  }
                }}
              >
                Delete
              </button>
              <button type="button" className="button" onClick={() => setOpen(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CaptionField({ value, onSave }: { value: string; onSave: (caption: string) => void }) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (draft.trim() !== value) onSave(draft)
  }
  return (
    <label className="photos__caption">
      Caption
      <input
        value={draft}
        maxLength={200}
        placeholder="Beach day, summer 2026"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </label>
  )
}
